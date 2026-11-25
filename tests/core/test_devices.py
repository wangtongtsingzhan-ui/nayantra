"""Simulation device workflows through the public API and executor."""
from test_core_api import client, wait_for  # noqa: F401


def test_bin_task_and_persistence(client):
    c = client
    robot = next(r for r in c.core.registry.robots.values() if r.fleet_id == 'warehouse_ugv')
    node = c.core.fleet.planning_origin(robot.id)
    body = {'id': 'bin1', 'name': 'Bin', 'type': 'bin', 'map_id': 'warehouse_demo', 'entry': node, 'duration_s': 0.05}
    assert c.post('/api/v1/devices', json=body).status_code == 201
    assert c.post('/api/v1/tasks', json={'type': 'device', 'params': {'device_id': 'bin1'}}).status_code == 422
    result = c.post('/api/v1/tasks', json={'type': 'device', 'params': {'device_id': 'bin1', 'operation': 'dropoff'}, 'requirements': {'robot_id': robot.id}})
    assert result.status_code == 201, result.text
    tid = result.json()['tasks'][0]['id']
    wait_for(lambda: c.get(f'/api/v1/tasks/{tid}').json()['status'] in ('completed', 'failed'), 15)
    assert c.get(f'/api/v1/tasks/{tid}').json()['status'] == 'completed'
    device = c.get('/api/v1/devices/bin1').json()
    assert device['occupied'] and device['holder'] is None
    assert c.core.store.get('devices', 'bin1')['occupied']
    result = c.post('/api/v1/tasks', json={'type': 'device', 'params': {'device_id': 'bin1', 'operation': 'dropoff'}, 'requirements': {'robot_id': robot.id}})
    tid = result.json()['tasks'][0]['id']
    wait_for(lambda: c.get(f'/api/v1/tasks/{tid}').json()['status'] == 'failed', 15)
    assert c.get('/api/v1/devices/bin1').json()['holder'] is None


def test_reservation_cancel_and_recovery(client):
    c = client
    robot = next(r for r in c.core.registry.robots.values() if r.fleet_id == 'warehouse_ugv')
    node = c.core.fleet.planning_origin(robot.id)
    body = {'id': 'term1', 'name': 'Terminal', 'type': 'terminal', 'map_id': 'warehouse_demo', 'entry': node, 'duration_s': 10}
    assert c.post('/api/v1/devices', json=body).status_code == 201
    result = c.post('/api/v1/tasks', json={'type': 'device', 'params': {'device_id': 'term1'}, 'requirements': {'robot_id': robot.id}})
    tid = result.json()['tasks'][0]['id']
    wait_for(lambda: c.get('/api/v1/devices/term1').json()['phase'] == 'service', 15)
    assert c.post('/api/v1/devices/term1/recover').status_code == 409
    assert c.post(f'/api/v1/tasks/{tid}/cancel', json={}).status_code == 200
    wait_for(lambda: c.get('/api/v1/devices/term1').json()['state'] == 'recovery_required', 5)
    assert c.get('/api/v1/devices/term1').json()['holder']['task_id'] == tid
    assert c.post('/api/v1/devices/term1/recover').json()['holder'] is None
    assert c.delete('/api/v1/devices/term1').status_code == 200


def test_lift_cross_floor_refused_and_config_validation(client):
    c = client
    assert c.post('/api/v1/devices', json={'id': 'door1', 'name': 'Door', 'type': 'door', 'map_id': 'warehouse_demo', 'entry': 'NA1'}).status_code == 422
    assert c.post('/api/v1/devices', json={'id': 'lift1', 'name': 'Lift', 'type': 'lift', 'map_id': 'warehouse_demo', 'entry': 'NA1'}).status_code == 201
    assert c.post('/api/v1/tasks', json={'type': 'device', 'params': {'device_id': 'lift1'}}).status_code == 422


def test_simulated_door_transit_and_exclusive_reservation(client):
    c = client
    robot = next(r for r in c.core.registry.robots.values() if r.fleet_id == 'warehouse_ugv')
    entry = c.core.fleet.planning_origin(robot.id)
    edge = next(l for l in c.core.registry.list_lanes('warehouse_demo') if l.from_id == entry or (l.bidirectional and l.to_id == entry))
    exit_point = edge.to_id if edge.from_id == entry else edge.from_id
    body = {'id': 'door2', 'name': 'Door', 'type': 'door', 'map_id': 'warehouse_demo', 'entry': entry, 'exit': exit_point, 'duration_s': 0.3}
    assert c.post('/api/v1/devices', json=body).status_code == 201
    result = c.post('/api/v1/tasks', json={'type': 'device', 'params': {'device_id': 'door2'}, 'requirements': {'robot_id': robot.id}})
    tid = result.json()['tasks'][0]['id']
    wait_for(lambda: c.get('/api/v1/devices/door2').json()['holder'] is not None, 15)
    assert not c.core.devices.acquire('door2', 'other', 'another_robot')
    wait_for(lambda: c.get(f'/api/v1/tasks/{tid}').json()['status'] in ('completed', 'failed'), 30)
    task = c.get(f'/api/v1/tasks/{tid}').json()
    assert task['status'] == 'completed', task
    assert c.get('/api/v1/devices/door2').json()['holder'] is None


def test_air_shower_sequence_and_fault(client):
    c = client
    robot = next(r for r in c.core.registry.robots.values() if r.fleet_id == 'warehouse_ugv')
    entry = c.core.fleet.planning_origin(robot.id)
    lanes = c.core.registry.list_lanes('warehouse_demo')
    def neighbors(node):
        return [l.to_id if l.from_id == node else l.from_id for l in lanes if l.from_id == node or (l.bidirectional and l.to_id == node)]
    inside = next(n for n in neighbors(entry) if any(x != entry for x in neighbors(n)))
    exit_point = next(n for n in neighbors(inside) if n != entry)
    body = {'id': 'shower1', 'name': 'Shower', 'type': 'air_shower', 'map_id': 'warehouse_demo', 'entry': entry, 'inside': inside, 'exit': exit_point, 'duration_s': 0.05}
    assert c.post('/api/v1/devices', json=body).status_code == 201
    result = c.post('/api/v1/tasks', json={'type': 'device', 'params': {'device_id': 'shower1'}, 'requirements': {'robot_id': robot.id}})
    tid = result.json()['tasks'][0]['id']
    wait_for(lambda: c.get(f'/api/v1/tasks/{tid}').json()['status'] in ('completed', 'failed'), 30)
    task = c.get(f'/api/v1/tasks/{tid}').json()
    assert task['status'] == 'completed', task
    assert [s['action'] for s in task['steps'] if s['action']] == ['device:acquire', 'device:open_entry', 'device:wash', 'device:open_exit', 'device:finish']

    assert c.post('/api/v1/devices', json={'id': 'fault1', 'name': 'Terminal', 'type': 'terminal', 'map_id': 'warehouse_demo', 'entry': exit_point, 'duration_s': 5}).status_code == 201
    result = c.post('/api/v1/tasks', json={'type': 'device', 'params': {'device_id': 'fault1'}, 'requirements': {'robot_id': robot.id}})
    tid = result.json()['tasks'][0]['id']
    wait_for(lambda: c.get('/api/v1/devices/fault1').json()['phase'] == 'service', 15)
    c.post('/api/v1/devices/fault1/fault', json={'fault': True})
    wait_for(lambda: c.get(f'/api/v1/tasks/{tid}').json()['status'] == 'failed', 5)
    assert c.get('/api/v1/devices/fault1').json()['state'] == 'recovery_required'


def test_charger_and_restart_preserves_interrupted_occupancy(client, tmp_path):
    c = client
    robot = next(r for r in c.core.registry.robots.values() if r.fleet_id == 'warehouse_ugv')
    node = c.core.fleet.planning_origin(robot.id)
    assert c.patch(f'/api/v1/waypoints/{node}', json={'type': 'charger'}).status_code == 200
    assert c.post('/api/v1/devices', json={'id': 'charge1', 'name': 'Charger', 'type': 'charger', 'map_id': 'warehouse_demo', 'entry': node}).status_code == 201
    c.core.fleet.runtimes[robot.id].adapter.battery = 100
    result = c.post('/api/v1/tasks', json={'type': 'device', 'params': {'device_id': 'charge1'}, 'requirements': {'robot_id': robot.id}})
    tid = result.json()['tasks'][0]['id']
    wait_for(lambda: c.get(f'/api/v1/tasks/{tid}').json()['status'] in ('completed', 'failed'), 15)
    assert c.get(f'/api/v1/tasks/{tid}').json()['status'] == 'completed'
    assert c.get('/api/v1/devices/charge1').json()['holder'] is None

    from nayantra.core.devices import DeviceManager
    from nayantra.core.events import EventBus
    from nayantra.core.store import DocumentStore
    store = DocumentStore(tmp_path / 'devices.db')
    bus = EventBus(store)
    mgr = DeviceManager(store, bus, c.core.registry)
    from nayantra.core.devices import DeviceCreate
    mgr.create(DeviceCreate(id='restart1', name='Terminal', type='terminal', map_id='warehouse_demo', entry=node))
    assert mgr.acquire('restart1', 'old_task', robot.id)
    store.close()
    store = DocumentStore(tmp_path / 'devices.db')
    restored = DeviceManager(store, EventBus(store), c.core.registry)
    assert restored.get('restart1')['state'] == 'recovery_required'
    assert not restored.acquire('restart1', 'new_task', robot.id)
    store.close()


def test_navigation_automatically_opens_bound_door(client):
    c = client
    robot = next(r for r in c.core.registry.robots.values() if r.fleet_id == 'warehouse_ugv')
    entry = c.core.fleet.planning_origin(robot.id)
    edge = next(l for l in c.core.registry.list_lanes('warehouse_demo') if l.from_id == entry or (l.bidirectional and l.to_id == entry))
    exit_point = edge.to_id if edge.from_id == entry else edge.from_id
    door = {'id': 'route_door', 'name': 'Route Door', 'type': 'door', 'map_id': 'warehouse_demo', 'entry': entry, 'exit': exit_point, 'lane_id': edge.id, 'duration_s': 1}
    assert c.post('/api/v1/devices', json=door).status_code == 201
    assert c.post('/api/v1/devices', json={**door, 'id': 'duplicate'}).status_code == 409
    assert c.delete(f'/api/v1/lanes/{edge.id}').status_code == 409
    result = c.post('/api/v1/tasks', json={'type': 'navigate', 'params': {'destination': exit_point}, 'requirements': {'robot_id': robot.id}})
    tid = result.json()['tasks'][0]['id']
    wait_for(lambda: c.get('/api/v1/devices/route_door').json()['phase'] == 'open_entry', 15)
    assert c.core.traffic.plans[robot.id].started == 0
    assert c.get('/api/v1/devices/route_door').json()['holder']['task_id'] == tid
    assert c.delete('/api/v1/devices/route_door').status_code == 409
    wait_for(lambda: c.get(f'/api/v1/tasks/{tid}').json()['status'] in ('completed', 'failed'), 30)
    task = c.get(f'/api/v1/tasks/{tid}').json()
    assert task['status'] == 'completed', task
    assert c.get('/api/v1/devices/route_door').json()['holder'] is None
    assert any('Opening simulated door' in h['message'] for h in task['history'])
    events = list(reversed(c.core.bus.recent(task_id=tid)))
    events = [e for e in events if e.type == 'DEVICE']
    assert [e.data['action'] for e in events] == ['status checked: closed before open', 'open requested', 'opened', 'status checked: open before close', 'close requested', 'closed']
    assert all(e.data['device_id'] == 'route_door' and e.data['simulated'] for e in events)


def test_route_door_fault_stops_normal_task(client):
    c = client
    robot = next(r for r in c.core.registry.robots.values() if r.fleet_id == 'warehouse_ugv')
    entry = c.core.fleet.planning_origin(robot.id)
    edge = next(l for l in c.core.registry.list_lanes('warehouse_demo') if l.from_id == entry or (l.bidirectional and l.to_id == entry))
    exit_point = edge.to_id if edge.from_id == entry else edge.from_id
    assert c.post('/api/v1/devices', json={'id': 'fault_door', 'name': 'Door', 'type': 'door', 'map_id': 'warehouse_demo', 'entry': entry, 'exit': exit_point, 'lane_id': edge.id, 'duration_s': 5}).status_code == 201
    r = c.post('/api/v1/tasks', json={'type': 'navigate', 'params': {'destination': exit_point}, 'requirements': {'robot_id': robot.id}})
    tid = r.json()['tasks'][0]['id']
    wait_for(lambda: c.get('/api/v1/devices/fault_door').json()['phase'] == 'open_entry', 15)
    c.post('/api/v1/devices/fault_door/fault', json={'fault': True})
    wait_for(lambda: c.get(f'/api/v1/tasks/{tid}').json()['status'] == 'failed', 5)
    assert c.get('/api/v1/devices/fault_door').json()['state'] == 'recovery_required'


def test_delivery_automatically_uses_route_door(client):
    c = client
    robot = next(r for r in c.core.registry.robots.values() if r.fleet_id == 'warehouse_ugv')
    entry = c.core.fleet.planning_origin(robot.id)
    edge = next(l for l in c.core.registry.list_lanes('warehouse_demo') if l.from_id == entry or (l.bidirectional and l.to_id == entry))
    exit_point = edge.to_id if edge.from_id == entry else edge.from_id
    body = {'id': 'delivery_door', 'name': 'Delivery Door', 'type': 'door', 'map_id': 'warehouse_demo', 'entry': entry, 'exit': exit_point, 'lane_id': edge.id, 'duration_s': 0.3}
    assert c.post('/api/v1/devices', json=body).status_code == 201
    result = c.post('/api/v1/tasks', json={'type': 'delivery', 'params': {'pickup': entry, 'dropoff': exit_point, 'pickup_s': 0.01, 'dropoff_s': 0.01}, 'requirements': {'robot_id': robot.id}})
    tid = result.json()['tasks'][0]['id']
    wait_for(lambda: c.get('/api/v1/devices/delivery_door').json()['holder'] is not None, 20)
    wait_for(lambda: c.get(f'/api/v1/tasks/{tid}').json()['status'] in ('completed', 'failed'), 30)
    task = c.get(f'/api/v1/tasks/{tid}').json()
    assert task['status'] == 'completed', task
    assert task['type'] == 'delivery'
    assert c.get('/api/v1/devices/delivery_door').json()['holder'] is None


def test_door_close_fault_keeps_reservation(client):
    c = client
    robot = next(r for r in c.core.registry.robots.values() if r.fleet_id == 'warehouse_ugv')
    entry = c.core.fleet.planning_origin(robot.id)
    edge = next(l for l in c.core.registry.list_lanes('warehouse_demo') if l.from_id == entry or (l.bidirectional and l.to_id == entry))
    exit_point = edge.to_id if edge.from_id == entry else edge.from_id
    assert c.post('/api/v1/devices', json={'id': 'close_fault', 'name': 'Door', 'type': 'door', 'map_id': 'warehouse_demo', 'entry': entry, 'exit': exit_point, 'lane_id': edge.id, 'duration_s': 1}).status_code == 201
    r = c.post('/api/v1/tasks', json={'type': 'navigate', 'params': {'destination': exit_point}, 'requirements': {'robot_id': robot.id}})
    tid = r.json()['tasks'][0]['id']
    wait_for(lambda: c.get('/api/v1/devices/close_fault').json()['phase'] == 'closing', 20)
    assert c.get('/api/v1/devices/close_fault').json()['holder']['task_id'] == tid
    c.post('/api/v1/devices/close_fault/fault', json={'fault': True})
    wait_for(lambda: c.get(f'/api/v1/tasks/{tid}').json()['status'] == 'failed', 5)
    wait_for(lambda: c.get('/api/v1/devices/close_fault').json()['state'] == 'recovery_required', 5)
    actions = [e.data['action'] for e in reversed(c.core.bus.recent(task_id=tid)) if e.type == 'DEVICE']
    assert actions == ['status checked: closed before open', 'open requested', 'opened', 'status checked: open before close', 'close requested']


def test_door_checks_preexisting_open_and_unknown_states(client):
    c = client
    robot = next(r for r in c.core.registry.robots.values() if r.fleet_id == 'warehouse_ugv')
    entry = c.core.fleet.planning_origin(robot.id)
    edge = next(l for l in c.core.registry.list_lanes('warehouse_demo') if l.from_id == entry or (l.bidirectional and l.to_id == entry))
    exit_point = edge.to_id if edge.from_id == entry else edge.from_id
    body = {'id': 'status_door', 'name': 'Door', 'type': 'door', 'map_id': 'warehouse_demo', 'entry': entry, 'exit': exit_point, 'lane_id': edge.id, 'duration_s': 0.2}
    assert c.post('/api/v1/devices', json=body).json()['door_status'] == 'closed'
    assert c.post('/api/v1/devices/status_door/simulated-status', json={'status': 'open'}).json()['door_status'] == 'open'
    task = c.post('/api/v1/tasks', json={'type': 'navigate', 'params': {'destination': exit_point}, 'requirements': {'robot_id': robot.id}}).json()['tasks'][0]
    tid = task['id']
    wait_for(lambda: c.get(f'/api/v1/tasks/{tid}').json()['status'] in ('completed', 'failed'), 30)
    assert c.get(f'/api/v1/tasks/{tid}').json()['status'] == 'completed'
    actions = [e.data['action'] for e in reversed(c.core.bus.recent(task_id=tid)) if e.type == 'DEVICE']
    assert actions == ['status checked: open before open', 'already open', 'status checked: open before close', 'close requested', 'closed']
    assert c.get('/api/v1/devices/status_door').json()['door_status'] == 'closed'
    assert c.post('/api/v1/devices/status_door/simulated-status', json={'status': 'unknown'}).status_code == 200
    task = c.post('/api/v1/tasks', json={'type': 'navigate', 'params': {'destination': entry}, 'requirements': {'robot_id': robot.id}}).json()['tasks'][0]
    tid = task['id']
    wait_for(lambda: c.get(f'/api/v1/tasks/{tid}').json()['status'] == 'failed', 20)
    wait_for(lambda: c.get('/api/v1/devices/status_door').json()['holder'] is None, 5)
    actions = [e.data['action'] for e in reversed(c.core.bus.recent(task_id=tid)) if e.type == 'DEVICE']
    assert actions == ['status checked: unknown before open']
    assert c.post('/api/v1/devices/status_door/simulated-status', json={'status': 'closed'}).status_code == 200


def test_standard_charge_reserves_until_robot_leaves(client):
    c = client
    robot = next(r for r in c.core.registry.robots.values() if r.fleet_id == 'warehouse_ugv')
    rt = c.core.fleet.runtimes[robot.id]
    node = c.core.fleet.planning_origin(robot.id)
    assert c.patch(f'/api/v1/waypoints/{node}', json={'type': 'charger'}).status_code == 200
    assert c.post('/api/v1/devices', json={'id': 'station', 'name': 'Station', 'type': 'charger', 'map_id': 'warehouse_demo', 'entry': node}).status_code == 201
    assert c.post('/api/v1/devices', json={'id': 'duplicate_station', 'name': 'Duplicate', 'type': 'charger', 'map_id': 'warehouse_demo', 'entry': node}).status_code == 409
    rt.adapter.battery = 100
    task = c.post('/api/v1/tasks', json={'type': 'charge', 'params': {'charger': node}, 'requirements': {'robot_id': robot.id}}).json()['tasks'][0]
    tid = task['id']
    wait_for(lambda: c.get(f'/api/v1/tasks/{tid}').json()['status'] in ('completed', 'failed'), 15)
    assert c.get(f'/api/v1/tasks/{tid}').json()['status'] == 'completed'
    wait_for(lambda: c.get('/api/v1/devices/station').json()['phase'] == 'occupied', 5)
    assert c.get('/api/v1/devices/station').json()['holder']['task_id'] == tid
    assert not c.core.devices.acquire('station', 'other', 'other_robot')
    edge = next(l for l in c.core.registry.list_lanes('warehouse_demo') if l.from_id == node or (l.bidirectional and l.to_id == node))
    target = edge.to_id if edge.from_id == node else edge.from_id
    r = c.post('/api/v1/tasks', json={'type': 'navigate', 'params': {'destination': target}, 'requirements': {'robot_id': robot.id}})
    assert r.status_code == 201
    wait_for(lambda: c.get('/api/v1/devices/station').json()['holder'] is None, 20)


def test_unbound_charge_never_fakes_success(client):
    c = client
    robot = next(r for r in c.core.registry.robots.values() if r.fleet_id == 'warehouse_ugv')
    node = c.core.fleet.planning_origin(robot.id)
    r = c.post('/api/v1/tasks', json={'type': 'charge', 'params': {'charger': node}, 'requirements': {'robot_id': robot.id}})
    assert r.status_code == 201
    tid = r.json()['tasks'][0]['id']
    wait_for(lambda: c.get(f'/api/v1/tasks/{tid}').json()['status'] == 'failed', 10)
    assert 'No simulated charger device' in c.get(f'/api/v1/tasks/{tid}').json()['status_reason']


def test_automatic_charge_uses_device_and_fault_preserves_occupancy(client):
    c = client
    robot = next(r for r in c.core.registry.robots.values() if r.fleet_id == 'warehouse_ugv')
    rt = c.core.fleet.runtimes[robot.id]
    node = c.core.fleet.planning_origin(robot.id)
    assert c.patch(f'/api/v1/waypoints/{node}', json={'type': 'charger'}).status_code == 200
    assert c.post('/api/v1/devices', json={'id': 'auto_station', 'name': 'Auto Station', 'type': 'charger', 'map_id': 'warehouse_demo', 'entry': node}).status_code == 201
    rt.adapter.battery = 50
    wait_for(lambda: c.get('/api/v1/devices/auto_station').json()['phase'] == 'charging', 10)
    device = c.get('/api/v1/devices/auto_station').json()
    tid = device['holder']['task_id']
    assert c.get(f'/api/v1/tasks/{tid}').json()['created_by'] == 'system'
    assert rt.adapter.snapshot().charging
    c.post('/api/v1/devices/auto_station/fault', json={'fault': True})
    wait_for(lambda: c.get(f'/api/v1/tasks/{tid}').json()['status'] == 'failed', 5)
    wait_for(lambda: c.get('/api/v1/devices/auto_station').json()['state'] == 'recovery_required', 5)
    assert not rt.adapter.snapshot().charging
    assert c.get('/api/v1/devices/auto_station').json()['holder']['task_id'] == tid


def test_two_robots_do_not_share_reserved_charger(client):
    c = client
    robots = [r for r in c.core.registry.robots.values() if r.fleet_id == 'warehouse_ugv']
    first, second = robots[:2]
    node = c.core.fleet.planning_origin(first.id)
    assert c.patch(f'/api/v1/waypoints/{node}', json={'type': 'charger'}).status_code == 200
    assert c.post('/api/v1/devices', json={'id': 'shared_charger', 'name': 'Shared', 'type': 'charger', 'map_id': 'warehouse_demo', 'entry': node}).status_code == 201
    c.core.fleet.runtimes[first.id].adapter.battery = 50
    def charge(robot):
        return c.post('/api/v1/tasks', json={'type': 'charge', 'params': {'charger': node}, 'requirements': {'robot_id': robot.id}}).json()['tasks'][0]['id']
    tid1 = charge(first)
    wait_for(lambda: c.get('/api/v1/devices/shared_charger').json()['phase'] == 'charging', 15)
    tid2 = charge(second)
    wait_for(lambda: c.get(f'/api/v1/tasks/{tid2}').json()['status'] == 'waiting_for_traffic', 15)
    assert c.get('/api/v1/devices/shared_charger').json()['holder']['task_id'] == tid1
    assert not c.core.fleet.runtimes[second.id].adapter.snapshot().charging
    assert c.post(f'/api/v1/tasks/{tid2}/cancel', json={}).status_code == 200
    assert c.get('/api/v1/devices/shared_charger').json()['holder']['task_id'] == tid1


def test_cancel_charging_stops_and_does_not_auto_restart(client):
    import time
    c = client
    robot = next(r for r in c.core.registry.robots.values() if r.fleet_id == 'warehouse_ugv')
    rt = c.core.fleet.runtimes[robot.id]
    node = c.core.fleet.planning_origin(robot.id)
    assert c.patch(f'/api/v1/waypoints/{node}', json={'type': 'charger'}).status_code == 200
    assert c.post('/api/v1/devices', json={'id': 'cancel_charger', 'name': 'Charger', 'type': 'charger', 'map_id': 'warehouse_demo', 'entry': node}).status_code == 201
    rt.adapter.battery = 50
    r = c.post('/api/v1/tasks', json={'type': 'charge', 'params': {'charger': node}, 'requirements': {'robot_id': robot.id}})
    tid = r.json()['tasks'][0]['id']
    wait_for(lambda: c.get('/api/v1/devices/cancel_charger').json()['phase'] == 'charging', 15)
    assert c.post(f'/api/v1/tasks/{tid}/cancel', json={}).status_code == 200
    wait_for(lambda: c.get('/api/v1/devices/cancel_charger').json()['state'] == 'recovery_required', 5)
    assert not rt.adapter.snapshot().charging
    assert c.post('/api/v1/devices/cancel_charger/recover', json={}).status_code == 200
    time.sleep(2.2)
    assert not rt.adapter.snapshot().charging
    assert c.get('/api/v1/devices/cancel_charger').json()['holder'] is None


def test_fleet_battery_policy_updates_simulated_robot(client):
    c = client
    fleet = c.get('/api/v1/fleets/warehouse_ugv').json()
    battery = {**fleet['battery'], 'min_pct': 15, 'recharge_pct': 45, 'charged_pct': 90}
    result = c.patch('/api/v1/fleets/warehouse_ugv', json={'battery': battery, 'charging_required': False})
    assert result.status_code == 200, result.text
    assert result.json()['battery'] == battery
    assert result.json()['charging_required'] is False
    wait_for(lambda: c.core.fleet.runtimes['ugv_01'].adapter.config.battery.recharge_pct == 45, 5)
    assert c.core.fleet.runtimes['ugv_01'].adapter.config.battery.charged_pct == 90
    assert c.core.store.get('fleets', 'warehouse_ugv')['battery'] == battery

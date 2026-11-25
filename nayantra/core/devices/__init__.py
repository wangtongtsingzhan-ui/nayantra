"""Simulation-only infrastructure devices and exclusive task sessions."""
from __future__ import annotations

import time
from typing import Literal

from pydantic import Field

from nayantra.core.errors import Conflict, Invalid, NotFound
from nayantra.core.models import Schema, SlugId


class DeviceCreate(Schema):
    id: SlugId
    name: str = Field(min_length=1, max_length=120)
    type: Literal['door', 'lift', 'air_shower', 'terminal', 'bin', 'charger']
    map_id: SlugId
    entry: SlugId
    inside: SlugId | None = None
    exit: SlugId | None = None
    duration_s: float = Field(default=0.5, ge=0.01, le=60)
    occupied: bool = False
    lane_id: SlugId | None = None


class DeviceManager:
    def __init__(self, store, bus, registry):
        self.store, self.bus, self.registry = store, bus, registry
        self.devices = {d['id']: d for d in store.list('devices')}
        # A persisted session remains blocked after restart until explicitly reset.
        for d in self.devices.values():
            if d['type'] == 'door' and 'door_status' not in d:
                # Older simulations had no physical status; only a new door can
                # start with a known closed state.
                d['door_status'] = 'unknown'
                self._save(d)
            if d.get('holder'):
                if d['type'] == 'door' and d.get('door_status') in ('opening', 'closing'):
                    d['door_status'] = 'unknown'
                d['state'] = 'recovery_required'
                self._save(d)

    def _save(self, d):
        d['updated_at'] = time.time()
        self.store.put('devices', d['id'], d, d['map_id'])
        self.bus.publish('device', d.copy())

    def get(self, device_id):
        if not isinstance(device_id, str):
            raise Invalid('device_id must be a string')
        if device_id not in self.devices:
            raise NotFound(f'Unknown device {device_id!r}')
        return self.devices[device_id]

    def create(self, body: DeviceCreate):
        if body.id in self.devices:
            raise Conflict(f'Device {body.id!r} already exists')
        self.registry.get_map(body.map_id)
        for point in (body.entry, body.inside, body.exit):
            if point:
                wp = self.registry.waypoints.get(point)
                if wp is None or wp.map_id != body.map_id:
                    raise Invalid(f'Waypoint {point!r} must exist on device map')
        if body.type in ('door', 'air_shower') and not body.exit:
            raise Invalid('Door and air shower require an exit waypoint')
        if body.type == 'air_shower' and not body.inside:
            raise Invalid('Air shower requires an inside waypoint')
        if body.type == 'charger':
            wp = self.registry.waypoints[body.entry]
            if wp.type not in ('charger', 'landing_pad'):
                raise Invalid('A charger device must be bound to a charging waypoint')
            if any(d['type'] == 'charger' and d['entry'] == body.entry for d in self.devices.values()):
                raise Conflict('Charging waypoint already has a charger device')
        if body.lane_id:
            if body.type != 'door':
                raise Invalid('Route binding currently supports simulated doors only')
            lane = self.registry.lanes.get(body.lane_id)
            if lane is None or lane.map_id != body.map_id or lane.layer != 'ground':
                raise Invalid('Device lane must be a ground lane on the device map')
            if {body.entry, body.exit} != {lane.from_id, lane.to_id}:
                raise Invalid('Door entry and exit must be the lane endpoints')
            if any(d.get('lane_id') == body.lane_id for d in self.devices.values()):
                raise Conflict('Lane already has a device')
        if body.type in ('door', 'air_shower') and len({p for p in (body.entry, body.inside, body.exit) if p}) != len([p for p in (body.entry, body.inside, body.exit) if p]):
            raise Invalid('Device transit waypoints must be distinct')
        d = body.model_dump(mode='json') | {'state': 'idle', 'holder': None, 'fault': False, 'phase': None, 'simulated': True}
        if body.type == 'door':
            d['door_status'] = 'closed'
        self.devices[body.id] = d
        self._save(d)
        return d

    def on_lane(self, map_id, lane_id):
        return next((d for d in self.devices.values()
                     if d['map_id'] == map_id and d.get('lane_id') == lane_id), None)

    def charger_at(self, map_id, waypoint):
        return next((d for d in self.devices.values() if d['type'] == 'charger'
                     and d['map_id'] == map_id and d['entry'] == waypoint), None)

    def delete(self, device_id):
        d = self.get(device_id)
        if d['holder']:
            raise Conflict('Device has an active or interrupted session')
        self.store.delete('devices', device_id)
        del self.devices[device_id]
        self.bus.publish('device_removed', {'id': device_id})

    def acquire(self, device_id, task_id, robot_id):
        d = self.get(device_id)
        if (d['type'] == 'charger' and d.get('phase') == 'occupied' and d.get('holder')
                and d['holder']['robot_id'] == robot_id and not d['fault']):
            d['holder']['task_id'] = task_id
            d['phase'] = 'reserved'
            self._save(d)
            return True
        if d['fault'] or (d['holder'] and d['holder']['task_id'] != task_id):
            return False
        if not d['holder']:
            d['holder'] = {'task_id': task_id, 'robot_id': robot_id}
            d['state'] = 'busy'
            d['phase'] = 'reserved'
            self._save(d)
        return True

    def phase(self, device_id, task_id, phase):
        d = self.get(device_id)
        if not d['holder'] or d['holder']['task_id'] != task_id or d['fault']:
            raise Conflict('Device session unavailable or faulted')
        d['phase'] = phase
        self._save(d)

    def door_status(self, device_id, task_id, status):
        d = self.get(device_id)
        if d['type'] != 'door' or not d['holder'] or d['holder']['task_id'] != task_id or d['fault']:
            raise Conflict('Door session unavailable or faulted')
        d['door_status'] = status
        self._save(d)

    def simulate_door_status(self, device_id, status):
        d = self.get(device_id)
        if d['type'] != 'door':
            raise Invalid('Device is not a simulated door')
        if d['holder']:
            raise Conflict('Cannot change status during a door session')
        d['door_status'] = status
        self._save(d)
        return d

    def finish(self, device_id, task_id, *, interrupted=False):
        d = self.devices.get(device_id)
        if d is None:  # The demo reset may remove devices while workers stop.
            return
        if not d['holder'] or d['holder']['task_id'] != task_id:
            return
        if interrupted:
            d['state'] = 'recovery_required'
            if d['type'] == 'door' and d.get('door_status') in ('opening', 'closing'):
                d['door_status'] = 'unknown'
        else:
            d['holder'], d['phase'] = None, None
            d['state'] = 'fault' if d['fault'] else 'idle'
        self._save(d)

    def fault(self, device_id, value):
        d = self.get(device_id)
        d['fault'] = value
        if d['state'] != 'recovery_required':
            d['state'] = 'fault' if value else ('busy' if d['holder'] else 'idle')
        self._save(d)
        return d

    def reset(self, device_id):
        d = self.get(device_id)
        if d['holder']:
            task = d['holder']['task_id']
            raise Conflict(f'Session {task} must be resolved after its task ends')
        d['fault'], d['state'], d['phase'] = False, 'idle', None
        self._save(d)
        return d

    def recover(self, device_id, active_task_ids):
        d = self.get(device_id)
        if d['holder'] and d['holder']['task_id'] in active_task_ids:
            raise Conflict('Cannot recover an active device task')
        d['holder'], d['phase'], d['fault'], d['state'] = None, None, False, 'idle'
        self._save(d)
        return d

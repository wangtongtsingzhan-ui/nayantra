/** Company mark shared by the header and assistant. */
export function Logo({ size = 28, live = false, title = "清湛智造" }: { size?: number; live?: boolean; title?: string }) {
  return (
    <img
      className={"logo" + (live ? " live" : "")}
      src="/qingzhan-mark.png"
      width={size}
      height={size}
      alt={title}
    />
  );
}

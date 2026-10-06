declare module "vexchords" {
  export function draw(
    element: HTMLElement,
    chord: unknown,
    options?: Record<string, unknown>,
  ): void;
}

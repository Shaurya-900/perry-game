import type { Input } from "./types";

/**
 * One thumb, portrait, standing up in a crowd:
 *   tap anywhere        -> jump (hold for a higher one)
 *   tap the lower third -> slide
 *   swipe down          -> slide
 * Keyboard is wired up too, purely so the game can be developed on a laptop.
 */
export class InputController {
  private held = false;
  private pendingJump = false;
  private pendingSlide = false;
  private startY = 0;
  private startX = 0;
  private swiped = false;
  private activePointer: number | null = null;
  private el: HTMLElement | null = null;

  attach(el: HTMLElement): void {
    this.el = el;
    el.addEventListener("pointerdown", this.onDown, { passive: false });
    el.addEventListener("pointermove", this.onMove, { passive: false });
    el.addEventListener("pointerup", this.onUp);
    el.addEventListener("pointercancel", this.onUp);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
  }

  detach(): void {
    const el = this.el;
    if (el) {
      el.removeEventListener("pointerdown", this.onDown);
      el.removeEventListener("pointermove", this.onMove);
      el.removeEventListener("pointerup", this.onUp);
      el.removeEventListener("pointercancel", this.onUp);
    }
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    this.el = null;
  }

  /** Edge-triggered flags are cleared once read, so no input is applied twice. */
  consume(): Input {
    const out: Input = {
      jumpPressed: this.pendingJump,
      jumpHeld: this.held,
      slidePressed: this.pendingSlide,
    };
    this.pendingJump = false;
    this.pendingSlide = false;
    return out;
  }

  reset(): void {
    this.held = false;
    this.pendingJump = false;
    this.pendingSlide = false;
    this.activePointer = null;
  }

  private onDown = (e: PointerEvent) => {
    e.preventDefault();
    if (this.activePointer !== null) return;
    this.activePointer = e.pointerId;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    this.startY = e.clientY;
    this.startX = e.clientX;
    this.swiped = false;
    if (e.clientY - rect.top > rect.height * 0.68) {
      this.pendingSlide = true;
      this.swiped = true;
      return;
    }
    this.pendingJump = true;
    this.held = true;
  };

  private onMove = (e: PointerEvent) => {
    if (e.pointerId !== this.activePointer || this.swiped) return;
    const dy = e.clientY - this.startY;
    const dx = Math.abs(e.clientX - this.startX);
    if (dy > 28 && dy > dx) {
      this.swiped = true;
      this.pendingSlide = true;
      this.held = false;
    }
  };

  private onUp = (e: PointerEvent) => {
    if (e.pointerId !== this.activePointer) return;
    this.activePointer = null;
    this.held = false;
  };

  private onBlur = () => this.reset();

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") {
      if (!e.repeat) this.pendingJump = true;
      this.held = true;
      e.preventDefault();
    } else if (e.code === "ArrowDown" || e.code === "KeyS") {
      if (!e.repeat) this.pendingSlide = true;
      e.preventDefault();
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") {
      this.held = false;
    }
  };
}

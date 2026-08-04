import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "../lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn("fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0", className)}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

// Radix's Select/DropdownMenu/Popover/Command all render their open content
// into a separate document.body portal, tagged with data-radix-popper-
// content-wrapper -- outside the Dialog's own DOM subtree. Without this
// guard, interacting with a <Select> nested inside a <Dialog> registers as
// happening "outside" the dialog and closes it before the click/selection
// even lands (a well-known Radix Dialog+Select interaction, not specific to
// any one form on this site). Every DialogContent gets this for free rather
// than each page working around it individually.
//
// This must guard BOTH onPointerDownOutside AND onInteractOutside, not just
// the former. Radix's DismissableLayer (which Dialog.Content is built on)
// dismisses on two independent triggers: a pointer-down outside the layer,
// AND a focus change to an element outside the layer (its own separate
// useFocusOutside hook, firing onFocusOutside then onInteractOutside) --
// confirmed directly in @radix-ui/react-dismissable-layer's source. A
// Select's listbox manages keyboard focus within its own portal content the
// moment it opens, which Dialog's focus-outside detection treats as "focus
// left the dialog" and dismisses on -- completely independent of the
// pointer-down path, so guarding only onPointerDownOutside (as this used to)
// leaves the dialog closing via keyboard navigation or any focus-driven
// selection, only masking the bug for a plain unmodified mouse click.
// onInteractOutside fires for both paths (Radix calls it right after the
// more specific onPointerDownOutside/onFocusOutside, sharing the same
// event), so guarding it here closes both gaps in one place.
function ignorePointerDownInsidePopper(event: Event) {
  const target = event.target as HTMLElement | null;
  if (target?.closest("[data-radix-popper-content-wrapper]")) {
    event.preventDefault();
  }
}

export const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, onPointerDownOutside, onInteractOutside, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-1/2 top-1/2 z-50 grid w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 border bg-background p-6 shadow-lg duration-200 sm:rounded-lg max-h-[90vh] overflow-y-auto",
        className,
      )}
      onPointerDownOutside={(e) => {
        ignorePointerDownInsidePopper(e);
        onPointerDownOutside?.(e);
      }}
      onInteractOutside={(e) => {
        ignorePointerDownInsidePopper(e);
        onInteractOutside?.(e);
      }}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col space-y-1.5 text-left", className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />;
}

export const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn("text-lg font-semibold leading-none tracking-tight", className)} {...props} />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

export const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

import { useEffect, useRef } from "react";

export interface DialogProps {
  open: boolean;
  onClose: () => void; // This replaces dialogStateChange
  contents: React.ReactNode;
}

export default function Dialog({ open, onClose, contents }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  // 1. Sync the Browser's internal "Top Layer" state with React's "open" prop
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal(); // Opens the dialog in the "Top Layer" (no z-index issues!)
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose} // 2. Fires when user hits 'Esc' or dialog.close() is called
      className="m-auto bg-transparent p-0 border-none backdrop:bg-black/50 backdrop:backdrop-blur-sm"
      onClick={(e) => {
        // 3. Optional: Modern "Click outside to close" logic
        if (e.target === dialogRef.current) onClose();
      }}
    >
      {/* 🚩 YOUR ORIGINAL CSS & DESIGN ELEMENTS START HERE */}
      <div className="dialog-placement">
        <div className="relative group">
          {/* Your original accent border and content containers */}
          <div className="dialog-accent-border group-hover:opacity-100 group-hover:duration-2000"></div>
          <div className="dialog-content-container">
            {contents}
          </div>
        </div>
      </div>
    </dialog>
  );
}

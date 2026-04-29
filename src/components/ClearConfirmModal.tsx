import { useState } from "react";

interface Props {
  title: string;
  message: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

export function ClearConfirmModal({ title, message, onConfirm, onClose }: Props) {
  const [clearing, setClearing] = useState(false);

  const handleConfirm = async () => {
    setClearing(true);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      console.error("Failed to clear:", err);
    } finally {
      setClearing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6 dark:bg-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none dark:hover:text-slate-300"
          >
            &times;
          </button>
        </div>

        <p className="text-sm text-gray-600 dark:text-slate-400 mb-5">{message}</p>

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 dark:text-slate-400 dark:hover:text-slate-200"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={clearing}
            className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors text-sm font-medium disabled:opacity-50"
          >
            {clearing ? "Clearing..." : "Clear"}
          </button>
        </div>
      </div>
    </div>
  );
}

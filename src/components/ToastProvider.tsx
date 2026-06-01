import { createContext, useState, useCallback, useRef } from "react";

interface Toast {
  id: string;
  message: string;
  type: "info" | "success" | "error";
}

export interface ToastContextType {
  showToast: (message: string, type?: "info" | "success" | "error", duration?: number) => string;
  updateToast: (id: string, updates: { message?: string; type?: "info" | "success" | "error"; duration?: number }) => void;
  dismissToast: (id: string) => void;
}

export const ToastContext = createContext<ToastContextType>({
  showToast: () => "",
  updateToast: () => {},
  dismissToast: () => {},
});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismissToast = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const startTimer = useCallback((id: string, duration: number) => {
    const existing = timersRef.current.get(id);
    if (existing) clearTimeout(existing);
    if (duration > 0) {
      const timer = setTimeout(() => {
        timersRef.current.delete(id);
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
      timersRef.current.set(id, timer);
    }
  }, []);

  const showToast = useCallback(
    (message: string, type: "info" | "success" | "error" = "info", duration = 5000) => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev, { id, message, type }]);
      startTimer(id, duration);
      return id;
    },
    [startTimer],
  );

  const updateToast = useCallback(
    (id: string, updates: { message?: string; type?: "info" | "success" | "error"; duration?: number }) => {
      setToasts((prev) =>
        prev.map((t) =>
          t.id === id
            ? { ...t, ...(updates.message !== undefined && { message: updates.message }), ...(updates.type !== undefined && { type: updates.type }) }
            : t,
        ),
      );
      if (updates.duration !== undefined) {
        startTimer(id, updates.duration);
      }
    },
    [startTimer],
  );

  const borderColor = (type: Toast["type"]) => {
    if (type === "success") return "border-l-green-500";
    if (type === "error") return "border-l-red-500";
    return "border-l-blue-500";
  };

  return (
    <ToastContext.Provider value={{ showToast, updateToast, dismissToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center gap-2 min-w-[250px] max-w-[400px] bg-white border border-gray-200 border-l-4 ${borderColor(toast.type)} rounded-lg shadow-lg px-4 py-3 animate-[slideIn_0.2s_ease-out] dark:bg-slate-800 dark:border-slate-700`}
          >
            <span className="text-sm text-gray-800 flex-1 dark:text-slate-200">{toast.message}</span>
            <button
              onClick={() => dismissToast(toast.id)}
              className="text-gray-400 hover:text-gray-600 text-lg leading-none shrink-0 dark:hover:text-slate-300"
            >
              &times;
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

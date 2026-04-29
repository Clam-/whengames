import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

interface SavedAvailability {
  _id: Id<"savedAvailabilities">;
  name: string;
  isDefault?: boolean;
  slots: { dayKey: string; timeSlot: string; state: string }[];
}

interface Props {
  savedAvailabilities: SavedAvailability[];
  onClose: () => void;
}

export function ManageSavedAvailabilitiesModal({
  savedAvailabilities,
  onClose,
}: Props) {
  const renameMut = useMutation(api.savedAvailabilities.renameSaved);
  const deleteMut = useMutation(api.savedAvailabilities.deleteSaved);

  const [editingId, setEditingId] = useState<Id<"savedAvailabilities"> | null>(
    null
  );
  const [editName, setEditName] = useState("");
  const [deletingId, setDeletingId] = useState<Id<"savedAvailabilities"> | null>(
    null
  );

  const handleRename = async (id: Id<"savedAvailabilities">) => {
    const trimmed = editName.trim();
    if (!trimmed) return;
    try {
      await renameMut({ savedAvailabilityId: id, name: trimmed });
      setEditingId(null);
    } catch (err) {
      console.error("Failed to rename:", err);
    }
  };

  const handleDelete = async (id: Id<"savedAvailabilities">) => {
    try {
      await deleteMut({ savedAvailabilityId: id });
      setDeletingId(null);
    } catch (err) {
      console.error("Failed to delete:", err);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6 dark:bg-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">
            Manage Saved Availabilities
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none dark:hover:text-slate-300"
          >
            &times;
          </button>
        </div>

        {savedAvailabilities.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-slate-400 py-4 text-center">
            No saved availabilities yet.
          </p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {savedAvailabilities.map((sa) => (
              <div
                key={sa._id}
                className="border border-gray-200 rounded-lg p-3 dark:border-slate-700"
              >
                {editingId === sa._id ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRename(sa._id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                    />
                    <button
                      onClick={() => handleRename(sa._id)}
                      className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="text-xs px-2 py-1 text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200"
                    >
                      Cancel
                    </button>
                  </div>
                ) : deletingId === sa._id ? (
                  <div>
                    <p className="text-sm text-red-600 dark:text-rose-400 mb-2">
                      Delete &ldquo;{sa.name}&rdquo;? Any linked schedules will
                      keep their current nominations but will be unlinked.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDelete(sa._id)}
                        className="text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700"
                      >
                        Delete
                      </button>
                      <button
                        onClick={() => setDeletingId(null)}
                        className="text-xs px-2 py-1 text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium text-gray-900 dark:text-slate-100">
                        {sa.name}
                      </span>
                      {sa.isDefault && (
                        <span className="ml-2 text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded dark:bg-slate-700 dark:text-slate-400">
                          default
                        </span>
                      )}
                      <span className="ml-2 text-[10px] text-gray-400 dark:text-slate-500">
                        {sa.slots.length} slot{sa.slots.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => {
                          setEditingId(sa._id);
                          setEditName(sa.name);
                          setDeletingId(null);
                        }}
                        className="text-xs px-2 py-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-700"
                      >
                        Rename
                      </button>
                      <button
                        onClick={() => {
                          setDeletingId(sa._id);
                          setEditingId(null);
                        }}
                        className="text-xs px-2 py-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded dark:text-rose-400 dark:hover:text-rose-300 dark:hover:bg-rose-900/40"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end mt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 dark:text-slate-400 dark:hover:text-slate-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

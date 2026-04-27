import { useState } from "react";
import { Id } from "../../convex/_generated/dataModel";

interface SavedAvailability {
  _id: Id<"savedAvailabilities">;
  name: string;
  isDefault?: boolean;
}

interface Props {
  savedAvailabilities: SavedAvailability[];
  onApply: (savedAvailabilityId: Id<"savedAvailabilities">) => Promise<void>;
  onManage: () => void;
  onClose: () => void;
}

export function ApplyAvailabilityModal({
  savedAvailabilities,
  onApply,
  onManage,
  onClose,
}: Props) {
  const [selectedId, setSelectedId] = useState<Id<"savedAvailabilities"> | "">(
    savedAvailabilities.length > 0 ? savedAvailabilities[0]._id : ""
  );
  const [applying, setApplying] = useState(false);

  const handleApply = async () => {
    if (!selectedId) return;
    setApplying(true);
    try {
      await onApply(selectedId as Id<"savedAvailabilities">);
      onClose();
    } catch (err) {
      console.error("Failed to apply availability:", err);
    } finally {
      setApplying(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Apply Saved Availability
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            &times;
          </button>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          Choose which saved availability to apply to this schedule. Your
          current nominations will be replaced.
        </p>

        <select
          value={selectedId}
          onChange={(e) =>
            setSelectedId(e.target.value as Id<"savedAvailabilities">)
          }
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {savedAvailabilities.map((sa) => (
            <option key={sa._id} value={sa._id}>
              {sa.name}
              {sa.isDefault ? " (default)" : ""}
            </option>
          ))}
        </select>

        <div className="flex items-center justify-between">
          <button
            onClick={() => {
              onClose();
              onManage();
            }}
            className="text-xs text-blue-600 hover:text-blue-700 underline"
          >
            Manage saved availabilities
          </button>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              disabled={applying || !selectedId}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50"
            >
              {applying ? "Applying..." : "Apply"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

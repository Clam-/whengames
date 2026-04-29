import { useState, useRef, useEffect } from "react";
import { Id } from "../../convex/_generated/dataModel";

interface SavedAvailability {
  _id: Id<"savedAvailabilities">;
  name: string;
  isDefault?: boolean;
}

interface AvailabilityLink {
  profileId: string;
  savedAvailabilityId: string;
  savedAvailabilityName: string;
}

interface Props {
  scheduleType: "one-off" | "recurring";
  weekOffset: number;
  isSsoUser: boolean;
  profileId: Id<"userProfiles"> | null;
  savedAvailabilities: SavedAvailability[];
  currentLink: AvailabilityLink | null;
  onApply: (savedAvailabilityId: Id<"savedAvailabilities">) => void;
  onSaveOverwriteDefault: () => void;
  onSaveNew: () => void;
  onUnlink: () => void;
  onManage: () => void;
}

export function AvailabilitiesMenu({
  scheduleType,
  weekOffset,
  isSsoUser,
  profileId,
  savedAvailabilities,
  currentLink,
  onApply,
  onSaveOverwriteDefault,
  onSaveNew,
  onUnlink,
  onManage,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  if (!isSsoUser || !profileId) return null;

  const isLinked = !!currentLink;
  const isOneOff = scheduleType === "one-off";
  const isNonCurrentWeek = scheduleType === "recurring" && weekOffset !== 0;
  const hasNoSavedAvailabilities = savedAvailabilities.length === 0;

  // Button appearance
  let buttonClass =
    "text-xs px-3 py-1.5 rounded font-medium transition-colors flex items-center gap-1 border ";
  let buttonLabel = "Availabilities";
  let buttonTitle = "Manage saved availabilities";

  if (isNonCurrentWeek) {
    buttonClass +=
      "bg-gray-200 text-gray-500 border-gray-300 cursor-default dark:bg-slate-700 dark:text-slate-400 dark:border-slate-600";
    buttonTitle =
      "Making one-off nominations to a reoccurring schedule are not saved to your saved availability.";
    buttonLabel = isLinked ? currentLink.savedAvailabilityName : "Availabilities";
  } else if (isLinked) {
    buttonClass +=
      "bg-blue-100 text-blue-700 border-blue-300 hover:bg-blue-200 dark:bg-indigo-900/50 dark:text-indigo-300 dark:border-indigo-600 dark:hover:bg-indigo-800/50";
    buttonLabel = currentLink.savedAvailabilityName;
    buttonTitle = `Current availability is linked to ${currentLink.savedAvailabilityName}. Any changes made will be automatically applied to your saved availability.`;
  } else {
    buttonClass +=
      "bg-white text-gray-600 border-gray-300 hover:bg-gray-50 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600 dark:hover:bg-slate-700";
  }

  // Menu item helpers
  const menuItemBase =
    "block w-full text-left px-3 py-2 text-xs transition-colors ";
  const menuItemEnabled =
    menuItemBase + "text-gray-700 hover:bg-gray-100 cursor-pointer dark:text-slate-300 dark:hover:bg-slate-700";
  const menuItemDisabled =
    menuItemBase + "text-gray-400 cursor-not-allowed dark:text-slate-500";

  // Determine disabled states and hover text for each option
  const applyDisabled = hasNoSavedAvailabilities;
  const applyTitle = hasNoSavedAvailabilities
    ? "No saved availabilities."
    : "Apply a saved availability to this schedule";

  const saveDisabled = isOneOff;
  const saveTitle = isOneOff
    ? "Cannot save availability for one-off event"
    : "Save current nominations as your default availability";

  const saveNewDisabled = isOneOff;
  const saveNewTitle = isOneOff
    ? "Cannot save availability for one-off event"
    : "Save current nominations as a new named availability";

  const unlinkDisabled = !isLinked;
  const unlinkTitle = !isLinked
    ? "No saved availability applied. Nothing to unlink."
    : "Unlinking means any changes you make in this schedule will not be saved to the saved availability anymore.";

  const handleApplyClick = () => {
    if (applyDisabled) return;
    if (savedAvailabilities.length === 1) {
      // Apply directly
      onApply(savedAvailabilities[0]._id);
      setIsOpen(false);
    } else {
      // Open modal for selection
      onApply(null as any); // Signal to parent to open modal
      setIsOpen(false);
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => !isNonCurrentWeek && setIsOpen(!isOpen)}
        className={buttonClass}
        title={buttonTitle}
      >
        {buttonLabel}
        {!isNonCurrentWeek && (
          <svg
            className="w-3 h-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        )}
      </button>

      {isOpen && !isNonCurrentWeek && (
        <div className="absolute left-0 top-full mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-50 dark:bg-slate-800 dark:border-slate-700">
          {/* Apply */}
          <button
            onClick={handleApplyClick}
            disabled={applyDisabled}
            className={applyDisabled ? menuItemDisabled : menuItemEnabled}
            title={applyTitle}
          >
            Apply saved availability...
          </button>

          <div className="border-t border-gray-100 dark:border-slate-700" />

          {/* Save/overwrite default */}
          <button
            onClick={() => {
              if (!saveDisabled) {
                onSaveOverwriteDefault();
                setIsOpen(false);
              }
            }}
            disabled={saveDisabled}
            className={saveDisabled ? menuItemDisabled : menuItemEnabled}
            title={saveTitle}
          >
            Save/overwrite and link default availability
          </button>

          {/* Save new */}
          <button
            onClick={() => {
              if (!saveNewDisabled) {
                onSaveNew();
                setIsOpen(false);
              }
            }}
            disabled={saveNewDisabled}
            className={saveNewDisabled ? menuItemDisabled : menuItemEnabled}
            title={saveNewTitle}
          >
            Save and link new availability...
          </button>

          <div className="border-t border-gray-100 dark:border-slate-700" />

          {/* Unlink */}
          <button
            onClick={() => {
              if (!unlinkDisabled) {
                onUnlink();
                setIsOpen(false);
              }
            }}
            disabled={unlinkDisabled}
            className={unlinkDisabled ? menuItemDisabled : menuItemEnabled}
            title={unlinkTitle}
          >
            Unlink from saved
          </button>

          {/* Manage link */}
          {savedAvailabilities.length > 0 && (
            <>
              <div className="border-t border-gray-100 dark:border-slate-700" />
              <button
                onClick={() => {
                  onManage();
                  setIsOpen(false);
                }}
                className={menuItemEnabled + " text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"}
              >
                Manage saved availabilities
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

import { useState, useRef, useEffect } from "react";
import { Id } from "../../convex/_generated/dataModel";

interface Participant {
  _id: Id<"userProfiles">;
  displayName: string;
  profileImageUrl?: string;
  timezone: string;
}

interface AvailabilityLink {
  profileId: string;
  savedAvailabilityId: string;
  savedAvailabilityName: string;
}

interface Props {
  participants: Participant[];
  availabilityLinks: AvailabilityLink[];
  editingProfileId: Id<"userProfiles"> | null;
  onEditUser: (profileId: Id<"userProfiles">) => void;
  onStopEditing: () => void;
  onDeleteUser: (profileId: Id<"userProfiles">) => void;
  onBlockUser: (profileId: Id<"userProfiles">) => void;
}

export function ParticipantsMenu({
  participants,
  availabilityLinks,
  editingProfileId,
  onEditUser,
  onStopEditing,
  onDeleteUser,
  onBlockUser,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    type: "delete" | "block";
    profileId: Id<"userProfiles">;
    displayName: string;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setConfirmAction(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  const isEditing = editingProfileId !== null;
  const editingParticipant = isEditing
    ? participants.find((p) => p._id === editingProfileId)
    : null;

  // Check if a user has linked availability
  const hasLinkedAvailability = (profileId: Id<"userProfiles">) => {
    return availabilityLinks.some(
      (l) => String(l.profileId) === String(profileId)
    );
  };

  // Button appearance
  let buttonClass =
    "text-xs px-3 py-1.5 rounded font-medium transition-colors flex items-center gap-1 border ";
  let buttonLabel = "Users";

  if (isEditing && editingParticipant) {
    buttonClass +=
      "bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-200 dark:bg-amber-900/50 dark:text-amber-300 dark:border-amber-600 dark:hover:bg-amber-800/50";
    buttonLabel = editingParticipant.displayName;
  } else {
    buttonClass +=
      "bg-white text-gray-600 border-gray-300 hover:bg-gray-50 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600 dark:hover:bg-slate-700";
  }

  if (participants.length === 0) return null;

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={buttonClass}
        title={
          isEditing
            ? `Editing ${editingParticipant?.displayName}'s availability`
            : "Manage participant availabilities"
        }
      >
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z"
          />
        </svg>
        {buttonLabel}
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
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full mt-1 w-72 bg-white border border-gray-200 rounded-lg shadow-lg z-50 dark:bg-slate-800 dark:border-slate-700">
          {/* Header */}
          <div className="px-3 py-2 border-b border-gray-100 dark:border-slate-700">
            <span className="text-xs font-medium text-gray-500 dark:text-slate-400">
              Participants ({participants.length})
            </span>
          </div>

          {/* Stop editing button if currently editing */}
          {isEditing && (
            <>
              <button
                onClick={() => {
                  onStopEditing();
                  setIsOpen(false);
                }}
                className="block w-full text-left px-3 py-2 text-xs text-amber-700 hover:bg-amber-50 transition-colors dark:text-amber-400 dark:hover:bg-amber-900/30"
              >
                Stop editing {editingParticipant?.displayName}&apos;s availability
              </button>
              <div className="border-t border-gray-100 dark:border-slate-700" />
            </>
          )}

          {/* Confirmation dialog */}
          {confirmAction && (
            <div className="px-3 py-3 border-b border-gray-100 dark:border-slate-700">
              <p className="text-xs text-gray-700 mb-2 dark:text-slate-300">
                {confirmAction.type === "delete" ? (
                  <>
                    Remove all of{" "}
                    <span className="font-medium">
                      {confirmAction.displayName}
                    </span>
                    &apos;s availability from this schedule?
                  </>
                ) : (
                  <>
                    Block{" "}
                    <span className="font-medium">
                      {confirmAction.displayName}
                    </span>{" "}
                    and remove all their availability? They won&apos;t be able to
                    participate again.
                  </>
                )}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmAction(null)}
                  className="flex-1 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded transition-colors dark:text-slate-400 dark:hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (confirmAction.type === "delete") {
                      onDeleteUser(confirmAction.profileId);
                    } else {
                      onBlockUser(confirmAction.profileId);
                    }
                    setConfirmAction(null);
                    setIsOpen(false);
                  }}
                  className={`flex-1 px-2 py-1 text-xs text-white rounded transition-colors ${
                    confirmAction.type === "block"
                      ? "bg-red-600 hover:bg-red-700"
                      : "bg-orange-500 hover:bg-orange-600"
                  }`}
                >
                  {confirmAction.type === "delete" ? "Remove" : "Block"}
                </button>
              </div>
            </div>
          )}

          {/* Participant list */}
          <div className="max-h-60 overflow-y-auto py-1">
            {participants.map((participant) => {
              const isLinked = hasLinkedAvailability(participant._id);
              const isCurrentlyEditing = editingProfileId === participant._id;

              return (
                <div
                  key={participant._id}
                  className={`flex items-center gap-2 px-3 py-1.5 group ${
                    isCurrentlyEditing
                      ? "bg-amber-50 dark:bg-amber-900/20"
                      : "hover:bg-gray-50 dark:hover:bg-slate-700/50"
                  }`}
                >
                  {/* Avatar */}
                  {participant.profileImageUrl ? (
                    <img
                      src={participant.profileImageUrl}
                      alt=""
                      className="w-5 h-5 rounded-full shrink-0"
                    />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-gray-200 dark:bg-slate-600 flex items-center justify-center shrink-0">
                      <span className="text-[10px] text-gray-500 dark:text-slate-400">
                        {participant.displayName.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}

                  {/* Name */}
                  <span className="text-xs text-gray-700 flex-1 truncate dark:text-slate-300">
                    {participant.displayName}
                    {isLinked && (
                      <span
                        className="ml-1 text-blue-500 dark:text-blue-400"
                        title="Linked to saved availability"
                      >
                        *
                      </span>
                    )}
                  </span>

                  {/* Action icons */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    {/* Edit */}
                    <button
                      onClick={() => {
                        if (!isLinked) {
                          if (isCurrentlyEditing) {
                            onStopEditing();
                          } else {
                            onEditUser(participant._id);
                          }
                          setIsOpen(false);
                        }
                      }}
                      disabled={isLinked}
                      className={`p-1 rounded transition-colors ${
                        isLinked
                          ? "text-gray-300 cursor-not-allowed dark:text-slate-600"
                          : isCurrentlyEditing
                            ? "text-amber-600 hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-900/40"
                            : "text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:text-slate-500 dark:hover:text-blue-400 dark:hover:bg-blue-900/30"
                      }`}
                      title={
                        isLinked
                          ? "Cannot edit: user has linked their availability to a saved availability"
                          : isCurrentlyEditing
                            ? "Stop editing"
                            : `Edit ${participant.displayName}'s availability`
                      }
                    >
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                        />
                      </svg>
                    </button>

                    {/* Delete */}
                    <button
                      onClick={() =>
                        setConfirmAction({
                          type: "delete",
                          profileId: participant._id,
                          displayName: participant.displayName,
                        })
                      }
                      className="p-1 rounded text-gray-400 hover:text-orange-600 hover:bg-orange-50 transition-colors dark:text-slate-500 dark:hover:text-orange-400 dark:hover:bg-orange-900/30"
                      title={`Remove ${participant.displayName}'s availability`}
                    >
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>

                    {/* Block */}
                    <button
                      onClick={() =>
                        setConfirmAction({
                          type: "block",
                          profileId: participant._id,
                          displayName: participant.displayName,
                        })
                      }
                      className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors dark:text-slate-500 dark:hover:text-red-400 dark:hover:bg-red-900/30"
                      title={`Block ${participant.displayName}`}
                    >
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

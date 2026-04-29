import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { CreateScheduleModal } from "./CreateScheduleModal";

export function ScheduleList() {
  const schedules = useQuery(api.schedules.list);
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Schedules</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
        >
          + New Schedule
        </button>
      </div>

      {schedules === undefined ? (
        <div className="text-center py-12 text-gray-400 dark:text-slate-500">Loading...</div>
      ) : schedules.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 dark:text-slate-400 mb-4">No schedules yet.</p>
          <button
            onClick={() => setShowCreate(true)}
            className="text-blue-600 hover:text-blue-700 font-medium dark:text-blue-400 dark:hover:text-blue-300"
          >
            Create the first one!
          </button>
        </div>
      ) : (
        <div className="grid gap-3">
          {schedules.map((schedule) => (
            <a
              key={schedule._id}
              href={`/schedule/${schedule._id}`}
              className="block bg-white rounded-lg border border-gray-200 p-4 hover:border-blue-300 hover:shadow-sm transition-all no-underline dark:bg-slate-800 dark:border-slate-700 dark:hover:border-cyan-600"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-slate-100">
                    {schedule.title}
                  </h3>
                  {schedule.description && (
                    <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                      {schedule.description}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        schedule.type === "one-off"
                          ? "bg-green-100 text-green-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                          : "bg-purple-100 text-purple-700 dark:bg-violet-900/40 dark:text-violet-400"
                      }`}
                    >
                      {schedule.type === "one-off" ? "One-off" : "Recurring"}
                    </span>
                    {schedule.type === "one-off" &&
                      schedule.dateRangeStart &&
                      schedule.dateRangeEnd && (
                        <span className="text-xs text-gray-400 dark:text-slate-500">
                          {schedule.dateRangeStart} to {schedule.dateRangeEnd}
                        </span>
                      )}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-400 dark:text-slate-500">
                  {schedule.creatorImage && (
                    <img
                      src={schedule.creatorImage}
                      alt=""
                      className="w-5 h-5 rounded-full"
                    />
                  )}
                  <span>{schedule.creatorName}</span>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateScheduleModal onClose={() => setShowCreate(false)} />
      )}
    </div>
  );
}

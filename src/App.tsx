import { Header } from "./components/Header";
import { ScheduleList } from "./components/ScheduleList";

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      <Header />
      <main className="max-w-5xl mx-auto px-4 py-6">
        <ScheduleList />
      </main>
    </div>
  );
}

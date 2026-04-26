import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useLocation } from "react-router";

interface Props {
  currentName: string;
  onSubmit: (name: string) => void;
}

export function DisplayNamePrompt({ currentName, onSubmit }: Props) {
  const [name, setName] = useState(currentName);
  const { signIn } = useAuthActions();
  const location = useLocation();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onSubmit(name.trim());
    }
  };

  const handleLogin = () => {
    const currentPath = location.pathname + location.search + location.hash;
    void signIn("google", { redirectTo: currentPath });
  };

  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
      <form onSubmit={handleSubmit} className="flex items-center gap-3">
        <label className="text-sm font-medium text-yellow-800 whitespace-nowrap">
          Display Name:
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter your name to participate"
          className="flex-1 border border-yellow-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500 bg-white"
          autoFocus
        />
        <button
          type="submit"
          disabled={!name.trim()}
          className="bg-yellow-600 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-yellow-700 disabled:opacity-50 transition-colors"
        >
          Join
        </button>
        <button
          type="button"
          onClick={handleLogin}
          className="text-sm text-blue-600 hover:text-blue-700 whitespace-nowrap"
        >
          Login to access saved availabilityies, changes across devices &amp; more
        </button>
      </form>
    </div>
  );
}

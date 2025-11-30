import ChatBot from "@/components/ChatBot";
import FilmDisplay from "@/components/FilmDisplay";
import { FilmProvider } from "@/lib/FilmContext";

export default function Home() {
  return (
    <FilmProvider>
      <div className="min-h-screen bg-[#0a0a0a] flex">
        {/* Left Side - ChatBot */}
        <div className="w-1/2 border-r border-gray-800">
          <ChatBot />
        </div>

        {/* Right Side - Film Display */}
        <div className="w-1/2">
          <FilmDisplay />
        </div>
      </div>
    </FilmProvider>
  );
}

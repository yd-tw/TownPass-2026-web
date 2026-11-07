import ChatBox from "@/app/ui/chat-box";
import TownPassInfo from "@/app/ui/townpass-info";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-zinc-50 p-4 font-sans dark:bg-black">
      <TownPassInfo />
      <ChatBox />
    </div>
  );
}

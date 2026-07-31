import { DataProvider } from "@/components/DataProvider";
import { AppShell } from "@/components/AppShell";

export default function Home() {
  return (
    <DataProvider>
      <AppShell />
    </DataProvider>
  );
}

import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      {/* flex column so a page (the home hero) can grow to fill a tall screen
          instead of leaving a dead gap above the footer */}
      <main className="flex flex-1 flex-col">{children}</main>
      <Footer />
    </div>
  );
}

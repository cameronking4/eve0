import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-sm text-muted-foreground">This Forge studio route does not exist.</p>
      <Link href="/" className="text-sm underline">
        Back to studio
      </Link>
    </div>
  );
}

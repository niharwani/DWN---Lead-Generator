import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

export default function CheckEmailPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Check your inbox</CardTitle>
      </CardHeader>
      <CardBody>
        <p className="text-sm text-[var(--color-text-muted)]">
          We sent you a sign-in link. Click the link in your email to continue.
          The link expires in 15 minutes.
        </p>
        <p className="mt-4 text-xs text-[var(--color-text-subtle)]">
          Didn&apos;t receive it?{" "}
          <Link
            href="/login"
            className="underline underline-offset-2 hover:text-[var(--color-text-muted)]"
          >
            Try again
          </Link>
        </p>
      </CardBody>
    </Card>
  );
}

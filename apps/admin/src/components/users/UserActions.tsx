'use client';

import { useState } from 'react';
import { MoreHorizontal, ShieldBan, UserCog, ExternalLink } from 'lucide-react';
import Link from 'next/link';

interface Props {
  user: { id: string; email: string; name?: string; role: string };
}

export function UserActions({ user }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen((v) => !v)}
        className="p-1.5 rounded-md hover:bg-muted transition-colors"
      >
        <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 w-44 rounded-lg border bg-card shadow-lg py-1">
            <Link
              href={`/users/${user.id}`}
              className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
              onClick={() => setOpen(false)}
            >
              <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
              Ver detalle
            </Link>
            <button
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
              onClick={() => setOpen(false)}
            >
              <UserCog className="w-3.5 h-3.5 text-muted-foreground" />
              Cambiar rol
            </button>
            <div className="my-1 border-t" />
            <button
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
              onClick={() => setOpen(false)}
            >
              <ShieldBan className="w-3.5 h-3.5" />
              Suspender
            </button>
          </div>
        </>
      )}
    </div>
  );
}

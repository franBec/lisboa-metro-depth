import type { ReactNode } from 'react'
import { Link } from 'react-router'

interface InfoPageProps {
  title: string
  children: ReactNode
}

export function InfoPage({ title, children }: InfoPageProps) {
  return (
    <main className="min-h-screen bg-bg px-6 py-16 text-ink sm:px-10">
      <div className="mx-auto flex max-w-2xl flex-col gap-9">
        <header className="flex flex-col gap-3">
          <Link
            className="font-sans text-[10px] font-semibold tracking-[0.19em] text-muted uppercase transition-colors hover:text-ink"
            to="/"
          >
            Underground Atlas
          </Link>
          <h1 className="font-serif text-5xl font-normal tracking-[-0.04em] text-balance sm:text-6xl">
            {title}
          </h1>
        </header>

        <div className="flex flex-col gap-4 font-sans text-sm leading-6 text-muted [&_a]:text-ink [&_a]:underline [&_a]:underline-offset-4 [&_h2]:pt-3 [&_h2]:font-sans [&_h2]:text-[10px] [&_h2]:font-semibold [&_h2]:tracking-[0.16em] [&_h2]:text-ink [&_h2]:uppercase [&_li]:pl-1 [&_strong]:font-medium [&_strong]:text-ink [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-1.5 [&_ul]:pl-5">
          {children}
        </div>

        <Link
          className="w-fit border border-line px-3 py-2 font-sans text-[10px] tracking-[0.14em] text-muted uppercase transition-colors hover:border-line-strong hover:text-ink"
          to="/"
        >
          All maps
        </Link>
      </div>
    </main>
  )
}

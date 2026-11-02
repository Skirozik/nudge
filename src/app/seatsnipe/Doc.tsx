// Shared layout for the terms and privacy pages
export function Doc({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <article className="px-6 sm:px-10 pt-10 pb-20">
      <div className="max-w-[720px] mx-auto">
        <h1 className="font-[family-name:var(--font-display)] font-black text-[40px] sm:text-[52px] leading-none tracking-[-0.04em] mb-3">
          {title}
        </h1>
        <p className="text-[13px] text-[#8E8E93] mb-10">Last updated {updated}</p>
        <div className="space-y-4 text-[15px] leading-[1.7] text-[#C7C7CC] [&_h2]:text-white [&_h2]:text-[18px] [&_h2]:font-semibold [&_h2]:pt-6 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-2 [&_a]:text-white [&_a]:underline">
          {children}
        </div>
      </div>
    </article>
  )
}

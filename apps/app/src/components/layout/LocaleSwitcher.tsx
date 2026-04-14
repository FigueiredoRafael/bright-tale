"use client";

import { useLocale, useTranslations } from 'next-intl';
import { useRouter, usePathname } from '@/i18n/navigation';
import { locales, type Locale } from '@/i18n/config';
import { Globe } from 'lucide-react';

export default function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations('locale');

  function handleChange(newLocale: Locale) {
    router.replace(pathname, { locale: newLocale });
  }

  return (
    <div className="relative group">
      <button
        className="w-[34px] h-[34px] rounded-[9px] border border-border flex items-center justify-center text-muted-foreground hover:border-[#2D3F55] hover:text-[#94A3B8] transition-all"
        title={t('switchLanguage')}
      >
        <Globe className="h-[15px] w-[15px]" />
      </button>
      <div className="absolute right-0 top-full mt-1 bg-popover border border-border rounded-lg shadow-lg py-1 hidden group-hover:block min-w-[160px] z-50">
        {locales.map((l) => (
          <button
            key={l}
            onClick={() => handleChange(l)}
            className={`w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors ${
              l === locale ? 'text-primary font-medium' : 'text-foreground'
            }`}
          >
            {t(l)}
          </button>
        ))}
      </div>
    </div>
  );
}

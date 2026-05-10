'use client';

import OperationalDayHome from '@/components/panel/OperationalDayHome';

export default function PanelControlPage() {
  return (
    <div className="-mx-4 min-h-screen bg-[#f5f5f7] pb-4 pt-1 sm:-mx-5 sm:px-5 md:-mx-6 md:px-6">
      <div className="mx-auto max-w-full px-4 sm:max-w-2xl sm:px-0 md:max-w-4xl">
        <OperationalDayHome />
      </div>
    </div>
  );
}

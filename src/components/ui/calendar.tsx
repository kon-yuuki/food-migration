import * as React from 'react';
import { DayPicker } from 'react-day-picker';
import { ja } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

export function Calendar({ className, classNames, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays
      className={cn('rounded-2xl border border-teal-100 bg-white p-4 shadow-sm', className)}
      classNames={{
        months: 'flex flex-col gap-4',
        month: 'space-y-3',
        month_caption: 'flex items-center justify-center gap-2 pt-1',
        caption_label: 'text-sm font-semibold tracking-wide text-teal-900',
        nav: 'flex items-center gap-1',
        button_previous: cn(buttonVariants({ variant: 'outline', size: 'icon' }), 'h-7 w-7 border-teal-200 text-teal-800'),
        button_next: cn(buttonVariants({ variant: 'outline', size: 'icon' }), 'h-7 w-7 border-teal-200 text-teal-800'),
        month_grid: 'w-full border-separate border-spacing-y-1',
        weekdays: 'flex',
        weekday:
          'w-9 rounded-md text-[11px] font-semibold uppercase tracking-wider text-slate-500 sm:w-10',
        week: 'mt-1 flex w-full',
        day: 'relative h-9 w-9 p-0 text-center text-sm align-middle sm:h-10 sm:w-10',
        day_button:
          'box-border m-0 h-9 w-9 border border-transparent p-0 rounded-xl font-medium text-slate-700 transform-gpu will-change-transform transition-transform duration-150 ease-out hover:scale-110 motion-reduce:transform-none sm:h-10 sm:w-10 flex items-center justify-center',
        selected:
          'relative z-20 !rounded-full !bg-[#a7f3d0] !text-[#0f766e] !border-transparent font-bold shadow-[0_2px_10px_rgba(110,231,183,0.35)] hover:!bg-[#a7f3d0] hover:!text-[#0f766e] focus:!bg-[#a7f3d0] focus:!text-[#0f766e]',
        today:
          'relative z-10 [&>button]:!bg-transparent [&>button]:!text-[#0f766e] [&>button]:!border-transparent [&>button]:font-bold',
        outside: 'text-slate-300',
        disabled: 'text-slate-300 opacity-50',
        hidden: 'invisible',
        ...classNames
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === 'left' ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
      }}
      locale={ja}
      {...props}
    />
  );
}

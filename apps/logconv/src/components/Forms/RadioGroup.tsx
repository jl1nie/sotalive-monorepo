interface RadioOption<T extends string> {
  value: T
  label: string
}

interface RadioGroupProps<T extends string> {
  name: string
  label: string
  options: RadioOption<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
}

export function RadioGroup<T extends string>({
  name,
  label,
  options,
  value,
  onChange,
  className = '',
}: RadioGroupProps<T>) {
  return (
    <div className={`space-y-2 ${className}`}>
      <span className="label">{label}</span>
      <div className="flex flex-wrap gap-3">
        {options.map((option) => (
          <label
            key={option.value}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-lg cursor-pointer
              border transition-all duration-200
              ${value === option.value
                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
              }
            `}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={(e) => onChange(e.target.value as T)}
              className="sr-only"
            />
            <div
              className={`
                w-4 h-4 rounded-full border-2 flex items-center justify-center
                ${value === option.value
                  ? 'border-primary-500'
                  : 'border-gray-400 dark:border-gray-500'
                }
              `}
            >
              {value === option.value && (
                <div className="w-2 h-2 rounded-full bg-primary-500" />
              )}
            </div>
            <span className="text-sm font-medium">{option.label}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

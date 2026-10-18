interface TextInputProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  required?: boolean
  type?: 'text' | 'email' | 'password'
  className?: string
}

export function TextInput({
  id,
  label,
  value,
  onChange,
  placeholder,
  required = false,
  type = 'text',
  className = '',
}: TextInputProps) {
  return (
    <div className={`space-y-1 ${className}`}>
      <label htmlFor={id} className="label">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="input"
      />
    </div>
  )
}

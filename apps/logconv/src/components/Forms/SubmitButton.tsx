import { Loader2 } from 'lucide-react'

interface SubmitButtonProps {
  children: React.ReactNode
  loading?: boolean
  disabled?: boolean
  type?: 'submit' | 'button'
  onClick?: () => void
  variant?: 'primary' | 'secondary'
  className?: string
}

export function SubmitButton({
  children,
  loading = false,
  disabled = false,
  type = 'submit',
  onClick,
  variant = 'primary',
  className = '',
}: SubmitButtonProps) {
  const baseClasses = variant === 'primary' ? 'btn-primary' : 'btn-secondary'
  
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`${baseClasses} flex items-center justify-center gap-2 ${className}`}
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
      {children}
    </button>
  )
}

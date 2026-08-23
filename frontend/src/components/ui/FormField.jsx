import './FormField.css';

export function FormField({ label, id, error, className, ...inputProps }) {
  const errorId = error ? `${id}-error` : undefined;
  const inputClasses = ['form-field__input', error && 'form-field__input--error', className].filter(Boolean).join(' ');
  return (
    <div className="form-field">
      <label htmlFor={id} className="form-field__label">
        {label}
        {inputProps.required && (
          <>
            <span className="form-field__required" aria-hidden="true">
              {' '}
              *
            </span>
            <span className="visually-hidden"> (required)</span>
          </>
        )}
      </label>
      <input
        id={id}
        className={inputClasses}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        {...inputProps}
      />
      {error && (
        <p id={errorId} className="form-field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

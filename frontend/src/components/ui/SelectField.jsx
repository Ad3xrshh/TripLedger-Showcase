import './FormField.css';

/**
 * Dropdown counterpart to FormField, sharing the same .form-field CSS
 * classes so selects and text inputs look consistent in the same form.
 * options: [{ value, label }]
 */
export function SelectField({ label, id, error, options, ...selectProps }) {
  const errorId = error ? `${id}-error` : undefined;
  const selectClasses = ['form-field__input', 'form-field__input--select', error && 'form-field__input--error']
    .filter(Boolean)
    .join(' ');
  return (
    <div className="form-field">
      <label htmlFor={id} className="form-field__label">
        {label}
        {selectProps.required && (
          <>
            <span className="form-field__required" aria-hidden="true">
              {' '}
              *
            </span>
            <span className="visually-hidden"> (required)</span>
          </>
        )}
      </label>
      <select
        id={id}
        className={selectClasses}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        {...selectProps}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && (
        <p id={errorId} className="form-field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

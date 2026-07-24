import type { FormEvent, RefObject } from "react";

export interface FragmentInputProps {
  email: string;
  fragment: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  busy?: boolean;
  disabled?: boolean;
  accountName?: string;
  identityText?: string;
  label?: string;
  placeholder?: string;
  buttonLabel?: string;
  emptyButtonLabel?: string;
  busyLabel?: string;
  maxLength?: number;
  inputId?: string;
  className?: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

export function FragmentInput({
  email,
  fragment,
  inputRef,
  busy = false,
  disabled = false,
  accountName,
  identityText,
  label = "Say any words you have",
  placeholder = "A few words, or none",
  buttonLabel = "Find what I mean",
  emptyButtonLabel = "I need help",
  busyLabel = "Reading account",
  maxLength = 280,
  inputId = "fragment-input",
  className = "",
  onChange,
  onSubmit,
}: FragmentInputProps) {
  const helpId = inputId + "-help";
  const blocked = busy || disabled;
  const submitLabel = busy
    ? busyLabel
    : fragment.trim()
      ? buttonLabel
      : emptyButtonLabel;
  const shownIdentity =
    identityText ??
    (accountName
      ? accountName + " · " + email + " · Matched from the email already on this support request."
      : email + " · Matched from the email already on this support request.");
  const classes = ["request-block", className].filter(Boolean).join(" ");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blocked) return;
    onSubmit();
  }

  return (
    <section className={classes} aria-labelledby={inputId + "-label"}>
      <form
        className="request-form"
        onSubmit={submit}
        aria-busy={busy ? "true" : undefined}
      >
        <div className="request-copy">
          <label id={inputId + "-label"} htmlFor={inputId}>
            {label}
          </label>
          <p className="identity-line">
            <span aria-hidden="true" className="identity-mark">
              @
            </span>
            <span>{shownIdentity}</span>
          </p>
        </div>
        <div className="input-row">
          <input
            ref={inputRef}
            id={inputId}
            name="fragment"
            type="text"
            value={fragment}
            maxLength={maxLength}
            autoComplete="off"
            spellCheck
            disabled={blocked}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            aria-describedby={helpId}
          />
          <button
            className="help-button"
            type="submit"
            disabled={blocked}
            aria-busy={busy ? "true" : undefined}
          >
            {submitLabel}
          </button>
        </div>
        <p id={helpId} className="visually-hidden">
          Enter any words you can find. You can also leave this empty and ask for help.
        </p>
      </form>
    </section>
  );
}

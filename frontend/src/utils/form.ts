import { msg, str } from "@lit/localize";
import type { SlInput, SlTextarea } from "@shoelace-style/shoelace";

// TODO localize
const numberFormatter = new Intl.NumberFormat(undefined);

export type MaxLengthValidator = {
  helpText: string;
  validate: (e: CustomEvent) => void;
};

export function getHelpText(maxLength: number, currentLength: number) {
  const helpText = msg(
    str`Maximum ${numberFormatter.format(maxLength)} characters`,
  );

  if (currentLength > maxLength) {
    const overMax = currentLength - maxLength;
    return overMax === 1
      ? msg(str`${numberFormatter.format(overMax)} character over limit`)
      : msg(str`${numberFormatter.format(overMax)} characters over limit`);
  }

  return helpText;
}

/**
 * Validate field max length and set custom message in Shoelace inputs.
 * Usage:
 * ```
 * const { helpText, validate } = maxLengthValidator(10)
 *
 * <sl-input
 *   help-text=${helpText}
 *   @sl-input=${validate}
 * ></sl-input>
 * ```
 */
export function maxLengthValidator(maxLength: number): MaxLengthValidator {
  const helpText = msg(str`Maximum ${maxLength} characters`);
  const validate = (e: CustomEvent) => {
    const el = e.target as SlTextarea | SlInput;
    const helpText = getHelpText(maxLength, el.value.length);
    el.setCustomValidity(
      el.value.length > maxLength
        ? msg(str`Please shorten this text to ${maxLength} or less characters.`)
        : "",
    );
    el.helpText = helpText;
  };

  return { helpText, validate };
}

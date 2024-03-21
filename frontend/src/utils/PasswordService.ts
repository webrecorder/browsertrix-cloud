import { zxcvbn, zxcvbnOptions, type OptionsType } from "@zxcvbn-ts/core";

const loadOptions = async (): Promise<OptionsType> => {
  const zxcvbnCommonPackage = await import(
    /* webpackChunkName: "zxcvbnCommonPackage" */ "@zxcvbn-ts/language-common"
  );
  const zxcvbnEnPackage = await import(
    /* webpackChunkName: "zxcvbnEnPackage" */ "@zxcvbn-ts/language-en"
  );

  return {
    dictionary: {
      ...zxcvbnCommonPackage.dictionary,
      ...zxcvbnEnPackage.dictionary,
    },
    graphs: zxcvbnCommonPackage.adjacencyGraphs,
    translations: zxcvbnEnPackage.translations,
  };
};

/**
 * Test and estimate password strength
 */
export default class PasswordService {
  static readonly PASSWORD_MINLENGTH = 8 as const;
  static readonly PASSWORD_MAXLENGTH = 64 as const;
  static readonly PASSWORD_MIN_SCORE = 3 as const;

  static options?: OptionsType;

  /**
   * Update zxcvbn options asynchronously
   * @TODO Localize by loading different translations
   * @param opts See https://zxcvbn-ts.github.io/zxcvbn/guide/options/
   */
  static async setOptions(opts?: OptionsType) {
    if (!PasswordService.options) {
      PasswordService.options = await loadOptions();
    }
    if (opts) {
      zxcvbnOptions.setOptions({
        ...PasswordService.options,
        ...opts,
      });
    } else {
      zxcvbnOptions.setOptions(PasswordService.options);
    }
  }

  /**
   * @param password
   * @param userInputs Array of personal data to check against
   * @returns {ZxcvbnResult} See https://zxcvbn-ts.github.io/zxcvbn/guide/getting-started/#output
   */
  static async checkStrength(
    password: string,
    // User input to check, e.g. emails
    userInputs?: string[],
  ) {
    return zxcvbn(password, userInputs);
  }
}

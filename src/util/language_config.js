// @flow

const transliteration = require('transliterations').transliterate;

const data = require('./charmap.json');

const userDataMatrix = [
    [3,2,2,2,2,2,2,2,2,2,2,2,2,2,2],
    [2,3,2,2,2,2,2,2,2,2,2,2,2,2,2],
    [2,2,3,2,2,2,2,2,2,2,2,2,2,2,2],
    [2,2,2,3,2,2,2,2,2,2,2,2,2,2,2],
    [2,2,2,2,3,2,2,2,2,2,2,2,2,2,2],
    [2,2,2,2,2,3,2,2,2,2,2,2,2,2,2],
    [1,1,1,1,1,1,3,1,2,1,2,1,1,2,1],
    [2,2,2,2,2,2,2,3,2,2,2,2,2,2,2],
    [1,1,1,1,1,1,2,1,3,1,2,1,1,2,1],
    [2,2,2,2,2,2,2,2,2,3,2,2,2,2,2],
    [1,1,1,1,1,1,2,1,2,1,3,1,1,2,1],
    [2,2,2,2,2,2,2,2,2,2,2,3,2,2,2],
    [2,2,2,2,2,2,2,2,2,2,2,2,3,2,2],
    [1,1,1,1,1,1,2,1,2,1,2,1,1,3,1],
    [2,2,2,2,2,2,2,2,2,2,2,2,2,2,3]
];

const languageToCodepage = {
    "af": 8, "af-ZA": 8, "sq": 6, "sq-AL": 6, "gsw-FR": 8, "am-ET": 0, "ar": 12, "ar-DZ": 12, "ar-BH": 12, "ar-EG": 12, "ar-IQ": 12, "ar-JO": 12, "ar-KW": 12, "ar-LB": 12, "ar-LY": 12, "ar-MA": 12, "ar-OM": 12, "ar-QA": 12, "ar-SA": 12, "ar-SY": 12, "ar-TN": 12, "ar-AE": 12, "ar-YE": 12, "hy": 0, "hy-AM": 0, "as-IN": 0, "az": 10, "az-Cyrl-AZ": 7, "az-Latn-AZ": 10, "ba-RU": 7, "eu": 8, "eu-ES": 8, "be": 7, "be-BY": 7, "bn-BD": 0, "bn-IN": 0, "bs-Cyrl-BA": 7, "bs-Latn-BA": 6, "br-FR": 8, "bg": 7, "bg-BG": 7, "ca": 8, "ca-ES": 8, "zh-HK": 5, "zh-MO": 5, "zh-CN": 3, "zh-Hans": 3, "zh-SG": 3, "zh-TW": 5, "zh-Hant": 5, "co-FR": 8, "hr": 6, "hr-HR": 6, "hr-BA": 6, "cs": 6, "cs-CZ": 6, "da": 8, "da-DK": 8, "prs-AF": 12, "div": 0, "div-MV": 0, "nl": 8, "nl-BE": 8, "nl-NL": 8, "en": 8, "en-AU": 8, "en-BZ": 8, "en-CA": 8, "en-029": 8, "en-IN": 8, "en-IE": 8, "en-JM": 8, "en-MY": 8, "en-NZ": 8, "en-PH": 8, "en-SG": 8, "en-ZA": 8, "en-TT": 8, "en-GB": 8, "en-US": 8, "en-ZW": 8, "et": 13, "et-EE": 13, "fo": 8, "fo-FO": 8, "fil-PH": 8, "fi": 8, "fi-FI": 8, "fr": 8, "fr-BE": 8, "fr-CA": 8, "fr-FR": 8, "fr-LU": 8, "fr-MC": 8, "fr-CH": 8, "fy-NL": 8, "gl": 8, "gl-ES": 8, "ka": 0, "ka-GE": 0, "de": 8, "de-AT": 8, "de-DE": 8, "de-LI": 8, "de-LU": 8, "de-CH": 8, "el": 9, "el-GR": 9, "kl-GL": 8, "gu": 0, "gu-IN": 0, "ha-Latn-NG": 8, "he": 11, "he-IL": 11, "hi": 0, "hi-IN": 0, "hu": 6, "hu-HU": 6, "is": 8, "is-IS": 8, "ig-NG": 8, "id": 8, "id-ID": 8, "iu-Latn-CA": 8, "iu-Cans-CA": 0, "ga-IE": 8, "xh-ZA": 8, "zu-ZA": 8, "it": 8, "it-IT": 8, "it-CH": 8, "ja": 2, "ja-JP": 2, "kn": 0, "kn-IN": 0, "kk": 7, "kk-KZ": 7, "km-KH": 0, "qut-GT": 8, "rw-RW": 8, "sw": 8, "sw-KE": 8, "kok": 0, "kok-IN": 0, "ko": 4, "ko-KR": 4, "ky": 7, "ky-KG": 7, "lo-LA": 0, "lv": 13, "lv-LV": 13, "lt": 13, "lt-LT": 13, "wee-DE": 8, "lb-LU": 8, "mk": 7, "mk-MK": 7, "ms": 8, "ms-BN": 8, "ms-MY": 8, "ml-IN": 0, "mt-MT": 0, "mi-NZ": 0, "arn-CL": 8, "mr": 0, "mr-IN": 0, "moh-CA": 8, "mn": 7, "mn-MN": 7, "mn-Mong-CN": 0, "ne-NP": 0, "no": 8, "nb-NO": 8, "nn-NO": 8, "oc-FR": 8, "or-IN": 0, "ps-AF": 0, "fa": 12, "fa-IR": 12, "pl": 6, "pl-PL": 6, "pt": 8, "pt-BR": 8, "pt-PT": 8, "pa": 0, "pa-IN": 0, "quz-BO": 8, "quz-EC": 8, "quz-PE": 8, "ro": 6, "ro-RO": 6, "rm-CH": 8, "ru": 7, "ru-RU": 7, "smn-FI": 8, "smj-NO": 8, "smj-SE": 8, "se-FI": 8, "se-NO": 8, "se-SE": 8, "sms-FI": 8, "sma-NO": 8, "sma-SE": 8, "sa": 0, "sa-IN": 0, "sr": 7, "sr-Cyrl-BA": 7, "sr-Cyrl-SP": 7, "sr-Latn-BA": 6, "sr-Latn-SP": 6, "nso-ZA": 8, "tn-ZA": 8, "si-LK": 0, "sk": 6, "sk-SK": 6, "sl": 6, "sl-SI": 6, "es": 8, "es-AR": 8, "es-BO": 8, "es-CL": 8, "es-CO": 8, "es-CR": 8, "es-DO": 8, "es-EC": 8, "es-SV": 8, "es-GT": 8, "es-HN": 8, "es-MX": 8, "es-NI": 8, "es-PA": 8, "es-PY": 8, "es-PE": 8, "es-PR": 8, "es-ES": 8, "es-US": 8, "es-UY": 8, "es-VE": 8, "sv": 8, "sv-FI": 8, "sv-SE": 8, "syr": 0, "syr-SY": 0, "tg-Cyrl-TJ": 7, "tzm-Latn-DZ": 8, "ta": 0, "ta-IN": 0, "tt": 7, "tt-RU": 7, "te": 0, "te-IN": 0, "th": 1, "th-TH": 1, "bo-CN": 0, "tr": 10, "tr-TR": 10, "tk-TM": 6, "ug-CN": 12, "uk": 7, "uk-UA": 7, "wen-DE": 8, "ur": 12, "ur-PK": 12, "uz": 10, "uz-Cyrl-UZ": 7, "uz-Latn-UZ": 10, "vi": 14, "vi-VN": 14, "cy-GB": 8, "wo-SN": 8, "sah-RU": 7, "ii-CN": 0, "yo-NG": 8
};

const canReadOtherVectors = [[6, 8, 10, 13]];

const latinLanguages = [6, 8, 10, 13];

const countryToLanguage = {
    "AF": "fa-AF", "AX": "sv-AX", "AL": "sq", "DZ": "ar-DZ", "AS": "en-AS", "AD": "ca", "AO": "pt-AO", "AI": "en-AI", "AQ": "en", "AG": "en-AG", "AR": "es-AR", "AM": "hy", "AW": "nl-AW", "AU": "en-AU", "AT": "de-AT", "AZ": "az", "BS": "en-BS", "BH": "ar-BH", "BD": "bn-BD", "BB": "en-BB", "BY": "be", "BE": "nl-BE", "BZ": "en-BZ", "BJ": "fr-BJ", "BM": "en-BM", "BT": "dz", "BO": "es-BO", "BQ": "nl", "BA": "bs", "BW": "en-BW", "BV": "en", "BR": "pt-BR", "IO": "en-IO", "VG": "en-VG", "BN": "ms-BN", "BG": "bg", "BF": "fr-BF", "BI": "fr-BI", "KH": "km", "CM": "en-CM", "CA": "en-CA", "CV": "pt-CV", "KY": "en-KY", "CF": "fr-CF", "TD": "fr-TD", "CL": "es-CL", "CN": "zh-CN", "CX": "en", "CC": "ms-CC", "CO": "es-CO", "KM": "ar", "CK": "en-CK", "CR": "es-CR", "HR": "hr-HR", "CU": "es-CU", "CW": "nl", "CY": "el-CY", "CZ": "cs", "CD": "fr-CD", "DK": "da-DK", "DJ": "fr-DJ", "DM": "en-DM", "DO": "es-DO", "TL": "tet", "EC": "es-EC", "EG": "ar-EG", "SV": "es-SV", "GQ": "es-GQ", "ER": "aa-ER", "EE": "et", "ET": "am", "FK": "en-FK", "FO": "fo", "FJ": "en-FJ", "FI": "fi-FI", "FR": "fr-FR", "GF": "fr-GF", "PF": "fr-PF", "TF": "fr", "GA": "fr-GA", "GM": "en-GM", "GE": "ka", "DE": "de", "GH": "en-GH", "GI": "en-GI", "GR": "el-GR", "GL": "kl", "GD": "en-GD", "GP": "fr-GP", "GU": "en-GU", "GT": "es-GT", "GG": "en", "GN": "fr-GN", "GW": "pt-GW", "GY": "en-GY", "HT": "ht", "HM": "en", "HN": "es-HN", "HK": "zh-HK", "HU": "hu-HU", "IS": "is", "IN": "en-IN", "ID": "id", "IR": "fa-IR", "IQ": "ar-IQ", "IE": "en-IE", "IM": "en", "IL": "he", "IT": "it-IT", "CI": "fr-CI", "JM": "en-JM", "JP": "ja", "JE": "en", "JO": "ar-JO", "KZ": "kk", "KE": "en-KE", "KI": "en-KI", "XK": "sq", "KW": "ar-KW", "KG": "ky", "LA": "lo", "LV": "lv", "LB": "ar-LB", "LS": "en-LS", "LR": "en-LR", "LY": "ar-LY", "LI": "de-LI", "LT": "lt", "LU": "lb", "MO": "zh", "MK": "mk", "MG": "fr-MG", "MW": "ny", "MY": "ms-MY", "MV": "dv", "ML": "fr-ML", "MT": "mt", "MH": "mh", "MQ": "fr-MQ", "MR": "ar-MR", "MU": "en-MU", "YT": "fr-YT", "MX": "es-MX", "FM": "en-FM", "MD": "ro", "MC": "fr-MC", "MN": "mn", "ME": "sr", "MS": "en-MS", "MA": "ar-MA", "MZ": "pt-MZ", "MM": "my", "NA": "en-NA", "NR": "na", "NP": "ne", "NL": "nl-NL", "AN": "nl-AN", "NC": "fr-NC", "NZ": "en-NZ", "NI": "es-NI", "NE": "fr-NE", "NG": "en-NG", "NU": "niu", "NF": "en-NF", "KP": "ko-KP", "MP": "fil", "NO": "no", "OM": "ar-OM", "PK": "ur-PK", "PW": "pau", "PS": "ar-PS", "PA": "es-PA", "PG": "en-PG", "PY": "es-PY", "PE": "es-PE", "PH": "tl", "PN": "en-PN", "PL": "pl", "PT": "pt-PT", "PR": "en-PR", "QA": "ar-QA", "CG": "fr-CG", "RE": "fr-RE", "RO": "ro", "RU": "ru", "RW": "rw", "BL": "fr", "SH": "en-SH", "KN": "en-KN", "LC": "en-LC", "MF": "fr", "PM": "fr-PM", "VC": "en-VC", "WS": "sm", "SM": "it-SM", "ST": "pt-ST", "SA": "ar-SA", "SN": "fr-SN", "RS": "sr", "CS": "cu", "SC": "en-SC", "SL": "en-SL", "SG": "cmn", "SX": "nl", "SK": "sk", "SI": "sl", "SB": "en-SB", "SO": "so-SO", "ZA": "zu", "GS": "en", "KR": "ko-KR", "SS": "en", "ES": "es-ES", "LK": "si", "SD": "ar-SD", "SR": "nl-SR", "SJ": "no", "SZ": "en-SZ", "SE": "sv-SE", "CH": "de-CH", "SY": "ar-SY", "TW": "zh-TW", "TJ": "tg", "TZ": "sw-TZ", "TH": "th", "TG": "fr-TG", "TK": "tkl", "TO": "to", "TT": "en-TT", "TN": "ar-TN", "TR": "tr-TR", "TM": "tk", "TC": "en-TC", "TV": "tvl", "VI": "en-VI", "UG": "en-UG", "UA": "uk", "AE": "ar-AE", "GB": "en-GB", "US": "en-US", "UM": "en-UM", "UY": "es-UY", "UZ": "uz", "VU": "bi", "VA": "la", "VE": "es-VE", "VN": "vi", "WF": "wls", "EH": "ar", "YE": "ar-YE", "ZM": "en-ZM", "ZW": "en-ZW"
};

type NameRule = {
    rule: number,
    canRead?: boolean,
    canTransliterate?: boolean,
    isLatin?: boolean
}

class LanguageConfig {
    languageCodesToAdd: Object;
    languageCode: string;

    constructor() {
        this.languageCodesToAdd = {};
        this.languageCode = 'en';
        for (let languageCode in languageToCodepage) {
            let hyphenPlace = languageCode.indexOf('-');
            if (hyphenPlace !== -1) {
                let mainLanguage = languageCode.substring(0, hyphenPlace);
                if (typeof languageToCodepage[mainLanguage] === 'undefined') {
                    this.languageCodesToAdd[mainLanguage] = languageToCodepage[languageCode];
                }
            }
        }
        for (let languageCodeToAdd in this.languageCodesToAdd) {
            languageToCodepage[languageCodeToAdd] = this.languageCodesToAdd[languageCodeToAdd];
        }
        transliteration.setCharmap(data);
    }

    doTransliterate(str: string) {
        let result = transliteration(str, {unknown: ''});
        result = result.replace(/\s+/g, ' ');
        if (result.length === 0) {
            result = str;
        }
        return result;
    }
    
    setLanguage(code: string) {
        this.languageCode = code;
        console.log('language code has been set to: ' + this.languageCode);
    }
    
    getCodepageOfLanguage(languageCode: string): number {
        let ansiCode = languageToCodepage[languageCode];
        if (typeof ansiCode === 'undefined') {
            let hyphenPlace = languageCode.indexOf('-');
            if (hyphenPlace !== -1) {
                ansiCode = languageToCodepage[languageCode.substring(0, hyphenPlace)];
            }
        }
        return ansiCode;
    }
    
    canReadOther(languageCodeA: number, languageCodeB: number): boolean {
        if (languageCodeA === languageCodeB) {
            return true;
        }
        for (let i=0; i<canReadOtherVectors.length; ++i) {
            let canReadVector = canReadOtherVectors[i];
            if ((canReadVector.indexOf(languageCodeA) !== -1) && (canReadVector.indexOf(languageCodeB) !== -1)) {
                return true;
            }
        }
        return false;
    }
    
    isLatin(languageCode: number): boolean {
        return latinLanguages.indexOf(languageCode) !== -1;
    }

    getNameRule(dataCountry: string): NameRule {
        let dataLang = countryToLanguage[dataCountry];
        if (typeof dataLang === 'undefined') {
            return {rule: 3};
        }
        let ul = this.getCodepageOfLanguage(this.languageCode);
        if (typeof ul === 'undefined') {
            return {rule: 3};
        }
        let dl = this.getCodepageOfLanguage(dataLang);
        if (typeof dl === 'undefined') {
            return {rule: 3};
        }
        let isLatin = this.isLatin(dl);
        let canRead = this.canReadOther(ul, dl);
        let canTransliterate = (!canRead) && (!isLatin);
        return {
            rule: userDataMatrix[ul][dl],
            canRead: canRead,
            canTransliterate: canTransliterate,
            isLatin: isLatin
        };
    }
    
    getUiName(featureProperties: Object, nameProperty: string, dataCountry: string, nameRule: Object) {
        let rule = nameRule.rule;
        let uiName = featureProperties['name_' + this.languageCode];
        if (typeof uiName !== 'undefined') {
            return uiName;
        }
        if (nameRule.isLatin) {
            return nameProperty;
        }
        if (rule === 1 || rule === 2) {
            let englishName = featureProperties['name_en'];
            if (typeof englishName !== 'undefined') {
                return englishName;
            }
            if (nameRule.canTransliterate) {
                let result = this.doTransliterate(nameProperty); 
                return result;
            }
        }
        return nameProperty;
    }

    getText(featureProperties: Object, zoom: number) {
        let nameProperty = featureProperties['name'];
        if (typeof nameProperty === 'undefined') {
            return '';
        }
        let dataCountry = featureProperties['country'];
        let nameRule = this.getNameRule(dataCountry);
        let rule = nameRule.rule;
        let uiName = this.getUiName(featureProperties, nameProperty, dataCountry, nameRule);
        
        let countryLanguage, fieldName, dataNameOriginal;
        if (typeof dataCountry !== 'undefined') {
            countryLanguage = countryToLanguage[dataCountry];
            fieldName = 'name_' + countryLanguage.substring(0, 2);
            dataNameOriginal = featureProperties[fieldName] || nameProperty;
        }
        if (zoom >= 5.0) {
            if (typeof dataNameOriginal !== 'undefined') {
                if ((dataNameOriginal !== uiName) && (!nameRule.canRead)) {
                    return ' ' + uiName + ' \n' + dataNameOriginal;
                }
            }
        }
        return uiName;
    }
};

module.exports = LanguageConfig;
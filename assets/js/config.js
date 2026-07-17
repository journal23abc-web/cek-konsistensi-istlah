export const DEFAULT_TERMS = [
  { canonical: 'pengguna', variants: 'user, klien, customer' },
  { canonical: 'kata sandi', variants: 'password, kata kunci' },
];

export const AI_PROFILES = {
  accurate: {
    label: 'multilingual E5-small',
    model: 'Xenova/multilingual-e5-small',
    threshold: 0.84,
    template: (term) => `query: Istilah teknis yang bermakna ${term}`,
  },
  lite: {
    label: 'multilingual MiniLM',
    model: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
    threshold: 0.78,
    template: (term) => `Istilah teknis: ${term}`,
  },
};

export const STORAGE_KEY = 'validator-istilah:v2';

// Petites aides de grammaire française pour le fil d'actualité.
// Un pays porte { name, art } où art ∈ 'le' | 'la' | "l'" | 'les' | ''.

const VOWEL = /^[aeiouyhàâäéèêëîïôöûüœæ]/i;

export const startsWithVowel = (s) => VOWEL.test(s);

export function articleFor(name) {
  if (startsWithVowel(name)) return "l'";
  const low = name.toLowerCase();
  if (/(e|a|ie|ia)$/.test(low)) return 'la';
  return 'le';
}

export function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

// « la France », « le Brésil », « l'Allemagne », « les États-Unis », « Cuba »
export function art(c) {
  if (!c.art) return c.name;
  if (c.art === "l'") return "l'" + c.name;
  return c.art + ' ' + c.name;
}
export const Art = (c) => cap(art(c));

// « de la France », « du Brésil », « des États-Unis », « d'Israël »
export function de(c) {
  switch (c.art) {
    case 'le': return 'du ' + c.name;
    case 'les': return 'des ' + c.name;
    case 'la': return 'de la ' + c.name;
    case "l'": return "de l'" + c.name;
    default: return (startsWithVowel(c.name) ? "d'" : 'de ') + c.name;
  }
}

// « à la France », « au Brésil », « aux États-Unis », « à Cuba »
export function a(c) {
  switch (c.art) {
    case 'le': return 'au ' + c.name;
    case 'les': return 'aux ' + c.name;
    case 'la': return 'à la ' + c.name;
    case "l'": return "à l'" + c.name;
    default: return 'à ' + c.name;
  }
}

// « en France », « au Brésil », « aux États-Unis », « à Cuba »
export function en(c) {
  switch (c.art) {
    case 'le': return 'au ' + c.name;
    case 'les': return 'aux ' + c.name;
    case 'la': case "l'": return 'en ' + c.name;
    default: return 'à ' + c.name;
  }
}

export function plural(n, sing, plur) { return Math.abs(n) >= 2 ? plur : sing; }

// Accord du verbe avec un pays : « la France annexe » / « les États-Unis annexent »
export const isPl = (c) => c.art === 'les';
export const v = (c, sing, plur) => (isPl(c) ? plur : sing);

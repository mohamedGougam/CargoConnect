/**
 * Short search-specific UX copy. Not full app localization.
 */

export function ambiguousNearMessage(
  placeLabel: string,
  language?: string,
): string {
  const lang = (language ?? "en").toLowerCase().slice(0, 2);
  switch (lang) {
    case "nl":
      return `Ik vond enkele mogelijke havens bij “${placeLabel}”.`;
    case "de":
      return `Ich habe einige mögliche Häfen bei „${placeLabel}“ gefunden.`;
    case "fr":
      return `J’ai trouvé quelques ports possibles près de « ${placeLabel} ».`;
    case "es":
      return `Encontré algunos puertos posibles cerca de “${placeLabel}”.`;
    case "el":
      return `Βρήκα μερικά πιθανά λιμάνια κοντά στο «${placeLabel}».`;
    case "ar":
      return `وجدت عدة موانئ محتملة بالقرب من «${placeLabel}».`;
    default:
      return `I found a few possible ports near “${placeLabel}”.`;
  }
}

export function ambiguousBothMessage(language?: string): string {
  const lang = (language ?? "en").toLowerCase().slice(0, 2);
  switch (lang) {
    case "nl":
      return "Kies een herkomst- en bestemmingshaven om verder te gaan.";
    case "de":
      return "Bitte wählen Sie einen Abgangs- und Zielhafen.";
    case "fr":
      return "Choisissez un port d’origine et de destination pour continuer.";
    case "es":
      return "Elija un puerto de origen y uno de destino para continuar.";
    case "el":
      return "Επιλέξτε λιμάνι προέλευσης και προορισμού για να συνεχίσετε.";
    case "ar":
      return "اختر ميناء المغادرة وميناء الوصول للمتابعة.";
    default:
      return "Choose an origin and destination port to continue.";
  }
}

export function clarificationMessage(
  reason: string | null | undefined,
  language?: string,
): string {
  if (reason?.trim()) return reason.trim();
  const lang = (language ?? "en").toLowerCase().slice(0, 2);
  switch (lang) {
    case "nl":
      return "Kunt u herkomst en bestemming preciezer aangeven?";
    case "de":
      return "Können Sie Abgang und Ziel etwas genauer nennen?";
    case "fr":
      return "Pouvez-vous préciser l’origine et la destination ?";
    case "es":
      return "¿Puede precisar origen y destino?";
    case "el":
      return "Μπορείτε να διευκρινίσετε προέλευση και προορισμό;";
    case "ar":
      return "هل يمكنك توضيح المغادرة والوجهة بمزيد من الدقة؟";
    default:
      return "Could you clarify the origin and destination?";
  }
}

export function catalogueNoMatchMessage(
  placeLabel: string,
  language?: string,
): string {
  const place = placeLabel.trim() || "that place";
  const lang = (language ?? "en").toLowerCase().slice(0, 2);
  switch (lang) {
    case "nl":
      return `We begrepen “${place}”, maar vonden geen matchende haven in de huidige maritieme catalogus.`;
    case "de":
      return `Wir haben „${place}“ verstanden, aber keinen passenden Hafen im aktuellen Seekatalog gefunden.`;
    case "fr":
      return `Nous avons compris « ${place} », mais aucun port correspondant n’a été trouvé dans le catalogue maritime actuel.`;
    case "es":
      return `Entendimos “${place}”, pero no encontramos un puerto coincidente en el catálogo marítimo actual.`;
    default:
      return `We understood ${place}, but couldn't find a matching port in the current maritime catalogue.`;
  }
}

export function understoodAsPrefix(language?: string): string {
  const lang = (language ?? "en").toLowerCase().slice(0, 2);
  switch (lang) {
    case "nl":
      return "We begrepen uw verzoek als:";
    case "de":
      return "Wir haben Ihre Anfrage so verstanden:";
    case "fr":
      return "Nous avons compris votre demande comme :";
    case "es":
      return "Entendimos su solicitud como:";
    case "el":
      return "Κατανοήσαμε το αίτημά σας ως:";
    case "ar":
      return "فهمنا طلبك على أنه:";
    default:
      return "We understood your request as:";
  }
}

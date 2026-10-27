// Aide « Comment jouer ».
export const HELP_HTML = `
<div class="help">
  <h2>Comment jouer</h2>
  <p>Choisissez un pays, puis étendez vos frontières jusqu'à contrôler <b>100 %</b> de la planète. Atteignez l'<b>époque spatiale</b>, construisez un <b>spatioport</b> et une <b>fusée</b> : une nouvelle planète, plus grande et plus difficile, vous attend. Le jeu ne s'arrête jamais.</p>
  <h3>⚔️ Conquête</h3>
  <ul>
    <li>Touchez un territoire étranger, choisissez le <b>% de votre armée</b> à engager puis <b>Attaquer</b>. L'offensive avance territoire par territoire en direction de celui que vous avez visé.</li>
    <li>Chaque conquête laisse une garnison sur place : une offensive finit toujours par s'essouffler. Les troupes restantes reviennent dans votre réserve.</li>
    <li>Les montagnes, jungles, capitales et territoires historiques défendent mieux. Les attaques navales exigent la <b>Navigation</b> et subissent un malus (réduit par les ports).</li>
    <li>L'armée en réserve défend votre territoire : n'engagez pas tout au même endroit !</li>
    <li>Un pays affaibli peut <b>capituler</b>. Proposez la paix, un <b>pacte de non-agression</b> (trêve de 5 min), une alliance, ou exigez une reddition depuis le panneau du pays.</li>
  </ul>
  <h3>🤝 Diplomatie</h3>
  <ul>
    <li>L'IA juge chaque demande sur des critères concrets (relations, rapport de force, durée de la guerre, menaces communes) : insister ne sert à rien. Un refus impose un <b>délai</b> avant la demande suivante et dégrade un peu les relations.</li>
    <li>Chaque IA a une <b>personnalité</b> (pacifique, marchande, expansionniste, belliciste). Les relations avec vos voisins s'améliorent tant que vous restez en paix ; déclarer des guerres inquiète tout le voisinage.</li>
    <li>L'agressivité des IA monte progressivement : les premières minutes laissent le temps de développer son économie.</li>
  </ul>
  <h3>🏛️ Civilisation</h3>
  <ul>
    <li>La population produit de l'or 💰, de la recherche 🔬 et des soldats ⚔️. Les territoires fraîchement conquis sont agités et moins productifs.</li>
    <li>Construisez dans vos territoires : fermes, mines, casernes, universités, usines, ports, spatioport.</li>
    <li>Trois arbres technologiques : ⚔️ <b>Militaire</b>, 💰 <b>Économie</b>, 👥 <b>Population</b>. Une technologie exige une technologie de la même branche à l'époque précédente.</li>
    <li>Recherchez 4 technologies d'une époque (toutes branches confondues) pour passer à la suivante : Antiquité → Médiéval → Industriel → Moderne → Spatial.</li>
    <li>Trop d'or ? Recrutez des <b>mercenaires</b> depuis le panneau de votre pays.</li>
  </ul>
  <h3>🏛️ Empire (bouton 🏛️ ou touche E)</h3>
  <ul>
    <li><b>Gouvernement</b> : chaque régime a ses atouts (or, recherche, soldats…). Le premier choix est gratuit, les suivants imposent une transition.</li>
    <li><b>Merveilles</b> : une seule de chaque sur la planète, gros bonus permanent ; prenez la capitale qui l'abrite pour la récupérer.</li>
    <li><b>Ressources</b> 🐎 ⛓️ 💎 🛢️ ☢️ : visibles sur la carte en zoomant. Sans pétrole, Blindés et Aviation fonctionnent à moitié.</li>
    <li><b>Généraux</b> : vos victoires en font naître ; ils mènent vos offensives et gagnent des étoiles.</li>
    <li>Dans le panneau d'un pays : <b>accord commercial</b>, <b>vassalité</b> (au lieu de l'annexion), <b>espionnage</b>, et à l'ère moderne la <b>bombe atomique</b> (le monde ne vous le pardonnera pas).</li>
    <li>❄️ L'hiver ralentit les offensives aux hautes latitudes, 🌧️ la mousson dans les tropiques. Des crises mondiales surviennent de temps en temps.</li>
  </ul>
  <h3>🎮 Commandes</h3>
  <ul>
    <li><b>Souris</b> : clic = sélection, glisser = déplacer, molette = zoom. <b>Tactile</b> : toucher, glisser, pincer.</li>
    <li><b>Raccourcis</b> : <b>Espace</b> pause · <b>1 2 3</b> vitesse ×1/×2/×4 · <b>0</b> ×½ · <b>+ / −</b> plus vite / moins vite · <b>Tab</b> front suivant · <b>C</b> capitale · <b>F</b> recentrer · <b>M</b> mode de carte · <b>T</b> technologies · <b>E</b> empire · <b>S</b> statistiques · <b>N</b> fil d'actualité · <b>R</b> classement · <b>L</b> noms · <b>H</b> aide · <b>Échap</b> menu.</li>
    <li><b>Alertes</b> : touchez « 📍 Voir » (ou une actualité marquée 📍) pour aller sur place. La pause automatique se règle dans ☰ → Réglages.</li>
    <li><b>Modes de carte</b> (🗺️ ou M) : diplomatie, ressources, agitation, front. <b>Chiffres de la barre du haut</b> : touchez-les pour voir d'où ils viennent.</li>
    <li><b>👥 Multijoueur</b> (accueil) : créez une partie, partagez le code ; jusqu'à 6 joueurs, en chacun pour soi ou en 2 équipes alliées, avec un chrono. L'IA joue les autres pays. Score = territoires + objectifs (bouton 🎯) ; 💬 pour discuter.</li>
    <li><b>🧭 Conseiller</b> : des astuces selon votre situation, désactivables depuis le menu ☰.</li>
    <li><b>Rythme</b> (accueil) : en mode <i>Stratégique</i>, les guerres avancent plus lentement que l'économie, pour laisser le temps de planifier. <i>Classique</i> pour des parties plus nerveuses.</li>
    <li>La partie est sauvegardée automatiquement. Exportez-la en fichier depuis le menu ☰.</li>
  </ul>
</div>`;

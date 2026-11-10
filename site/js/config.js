/* The Morning Edition: site settings. The daily job's settings are in research/settings.json. */
window.DE_CONFIG = {
  name: "The Morning Edition",
  owner: "Rishi Singh",
  tagline: "Your day, folded and delivered at eight.",
  timeZone: "Asia/Kolkata",
  utcOffset: "+05:30",
  publishTime: "08:00",
  cleanupTime: "03:00",
  readDeleteDays: 2,      // delete this many days after Mark as read
  emailDeleteDays: 3,     // delete this many days after emailing, if untouched
  trashDays: 7,           // Recently deleted keeps items this long
  storiesPerDay: 5,
  topics: ["AI", "Education", "Research"],
  ignoreTopics: ["Celebrity", "Sports"],
  archiveEmail: "",       // kept out of the public site on purpose
  siteUrl: "https://rishichamp.github.io/morning-edition/",
  source: "feed",         // "feed": editions come from data/ written by the daily job
  mode: "scheduled"
};

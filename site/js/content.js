/* Sample edition content for layout and button testing.
   Every story here is placeholder text: no real source was read and no link is real.
   The publish job replaces this with summaries from connected sources. */
(function () {
  const C = window.DE_CONFIG;

  const fronts = [
    { kicker: "The big story", headline: "Smaller models are starting to beat bigger ones on reasoning tests", dek: "A sample front page about efficient models and what it could mean for a thesis that runs on one GPU." },
    { kicker: "On campus", headline: "Classrooms are writing their own rules for AI homework", dek: "A sample front page on how departments are drafting policies for assignments and lab reports." },
    { kicker: "Research desk", headline: "Benchmarks are under the microscope again", dek: "A sample front page on how results are reported, and why careful baselines matter more than ever." },
    { kicker: "The week ahead", headline: "Thesis season begins: a calm plan for the next seven days", dek: "A sample front page that turns the week's deadlines into one short, ordered list." },
    { kicker: "Tools", headline: "Speech models get faster, smaller and easier to run locally", dek: "A sample front page on lightweight models that fit on a laptop." },
    { kicker: "Policy", headline: "Free online courses expand for engineering students", dek: "A sample front page about new course catalogues and how to pick one worth the time." }
  ];

  const stories = [
    { h: "Open-weight models narrow the gap on reasoning tests", s: "Sample summary: several small open models posted scores close to larger systems on public reasoning sets. The gains came mostly from better training data.", w: "Smaller models are cheaper to fine-tune on a single cloud GPU like the one your thesis uses." },
    { h: "Universities trial AI tutors in first-year maths", s: "Sample summary: a pilot paired students with a chat tutor for weekly problem sets. Early feedback was mixed but attendance at help sessions rose.", w: "Useful background if your work touches education or student-facing tools." },
    { h: "A new study questions how benchmark scores are reported", s: "Sample summary: researchers re-ran popular baselines and found many reported gains shrank with fixed seeds. They propose a short reporting checklist.", w: "A checklist like this is worth applying to your own results chapter." },
    { h: "Engineering students get a wider free course catalogue", s: "Sample summary: a national platform added new courses in machine learning and data systems. Certificates remain optional.", w: "A low-cost way to fill gaps before your next review." },
    { h: "Cloud GPU waits grow as demand climbs", s: "Sample summary: providers report longer queues for high-memory GPUs in some regions. Spot prices moved up this week.", w: "Book training runs early and keep a smaller fallback instance ready." },
    { h: "A faster speech-recognition model fits on a laptop", s: "Sample summary: a research group shared a compact model that runs in real time on a CPU. Accuracy drops slightly on noisy audio.", w: "Handy if you ever need to transcribe meetings with your guide offline." },
    { h: "Schools draft simple rules for AI in assignments", s: "Sample summary: several schools published one-page guides on when AI help is allowed. Most ask students to say how they used it.", w: "Good practice for writing a clear methods note in your own reports." },
    { h: "A dataset aims to make summaries more faithful", s: "Sample summary: a new set pairs long documents with checked summaries and marks unsupported claims. It targets hallucination in summarisers.", w: "Relevant if your evaluation includes summary quality or factual checks." },
    { h: "Student research credits get a price cut", s: "Sample summary: two cloud providers lowered the cost of student research credits and simplified sign-up. Limits per account still apply.", w: "Could stretch your compute budget for the final experiments." },
    { h: "Supervisors share tips for writing results sections", s: "Sample summary: a short collection of advice stresses one claim per figure, honest error bars and a plain first sentence.", w: "Directly useful for the chapter you are drafting this month." }
  ];

  const briefs = [
    ["Reply to one thread that is waiting on you since yesterday.", "Two items on tomorrow's calendar overlap in the afternoon.", "A shared folder was updated and someone asked you to check it."],
    ["A document you own has two new comments to answer.", "Tomorrow starts early: the first item is before 9:30.", "One email asks you to confirm a time slot."],
    ["A deadline reminder arrived for the end of this week.", "No clashes tomorrow, but the afternoon is full.", "Someone mentioned you in a team channel about a file."],
  ];

  const inbox = [
    { group: "Needs a reply", items: ["A faculty member asked for an updated draft.", "A classmate asked you to confirm a lab slot."] },
    { group: "Courses and admin", items: ["An office shared a form with a due date.", "A course page posted new material."] },
    { group: "Updates", items: ["Two newsletters and one account notice.", "A cloud provider sent a usage summary."] }
  ];

  const calendars = [
    [{ t: "09:30", e: "A recurring class" }, { t: "15:00", e: "A meeting with your guide", clash: true }, { t: "15:00", e: "A group call", clash: true }, { t: "18:00", e: "A personal reminder" }],
    [{ t: "08:45", e: "An early lab session" }, { t: "12:30", e: "A lunch meeting" }, { t: "16:00", e: "A reading group" }],
    [{ t: "10:00", e: "A review meeting" }, { t: "14:00", e: "A workshop", clash: true }, { t: "14:30", e: "A short call", clash: true }]
  ];

  const slack = [
    "Someone mentioned you in a project channel and asked for a file.",
    "One direct message is waiting for a reply.",
    "A channel you follow had a busy morning: 14 new messages."
  ];

  const questions = [
    "What is one small thing you could finish before noon that would make the rest of the day lighter?",
    "Which result are you most sure of, and what would change your mind about it?",
    "If you could ask your supervisor only one question this week, what would it be?",
    "What did you learn yesterday that you have not written down yet?",
    "Which task have you been avoiding, and what is the first five-minute step?",
    "What would a calm version of today look like?"
  ];

  function pick(arr, i) { return arr[((i % arr.length) + arr.length) % arr.length]; }

  function build(date, i) {
    const n = C.storiesPerDay;
    const world = [];
    for (let k = 0; k < n; k++) {
      const s = pick(stories, i * 2 + k);
      world.push({ headline: s.h, summary: s.s, why: s.w, source: "Sample source", url: null, unverified: true });
    }
    const f = pick(fronts, i);
    return {
      date,
      sample: true,
      front: { kicker: f.kicker, headline: f.headline, dek: f.dek },
      brief: pick(briefs, i),
      myDay: {
        inbox: inbox,
        calendar: pick(calendars, i),
        slack: { note: "Slack does not expose read status here, so this shows recent activity instead.", items: slack }
      },
      world,
      question: pick(questions, i),
      record: {
        window: "Last 24 hours, up to " + C.publishTime + " IST",
        privacy: "No names, message text or meeting titles are printed. Items are described in general words.",
        verification: "Each story should link to its original source. Anything without a checked source is marked unverified.",
        unverified: ["This is a sample edition. No sources are connected yet, so every story, email and calendar item is placeholder text."]
      }
    };
  }

  window.DE_CONTENT = { build };
})();

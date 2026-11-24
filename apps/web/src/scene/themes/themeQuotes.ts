import type { EmployeeStatus } from "../../api/types";
import type { WorldThemeId } from "./registry";

export type ThemeQuoteBank = {
  general: readonly string[];
  byStatus: Partial<Record<EmployeeStatus, readonly string[]>>;
};

export const THEME_QUOTE_BANKS: Record<Exclude<WorldThemeId, "office">, ThemeQuoteBank> = {
  western: {
    general: [
      "Howdy, partner. Let's wrangle some code.",
      "This bug's been runnin' wild since dawn.",
      "I'm a one-man code wrangler, and I'm tired.",
      "Yeehaw! That commit rode in clean.",
      "The server's actin' up like a wild mustang.",
      "I've got more tabs open than a saloon has bottles.",
      "This codebase is a dusty trail with no end.",
      "I'm too busy to be spittin' out errors.",
    ],
    byStatus: {
      working: [
        "Saddlin' up to the keyboard, partner.",
        "Chasin' bugs across the digital plains.",
        "Ridin' hard on this feature, no rest.",
      ],
      waiting_approval: [
        "Waitin' on the sheriff's stamp.",
        "Hangin' by the fence for the green light.",
        "The boss ain't back from the saloon yet.",
      ],
      idle: [
        "Just moseyin' around the corral.",
        "Sittin' on the porch, watchin' the dust settle.",
        "Nothin' to do but polish my spurs.",
      ],
      on_break: [
        "Grabbin' a coffee at the saloon.",
        "Stretchin' my legs by the water trough.",
        "Takkin' a breather under the big sky.",
      ],
      failed: [
        "Well, that rode off a cliff.",
        "The whole herd's spooked now.",
        "I reckon I lost the trail, partner.",
      ],
    },
  },
  horror: {
    general: [
      "The server room is haunted by old bugs.",
      "I hear whispers from the deprecated code.",
      "Something's lurking in the dark corners of the repo.",
      "The lights flicker every time I push to main.",
      "I can't shake the feeling I'm being watched by the linter.",
      "The ghost of a null pointer haunts my dreams.",
      "Every commit feels like a séance.",
      "The office is empty, but the errors keep coming.",
    ],
    byStatus: {
      working: [
        "Banishing bugs with my spectral keyboard.",
        "Conjuring a fix from the void.",
        "Summoning the spirits of clean code.",
      ],
      waiting_approval: [
        "Awaiting the ghost's approval.",
        "The specter hasn't answered yet.",
        "Waiting in the dark for a sign.",
      ],
      idle: [
        "Staring into the abyss of an empty queue.",
        "Listening to the silence between the servers.",
        "Just drifting through the haunted halls.",
      ],
      on_break: [
        "Taking a break from the curse.",
        "Stepping out into the cold night air.",
        "Resting my eyes from the glowing screens.",
      ],
      failed: [
        "The curse has claimed another build.",
        "I've been possessed by a syntax error.",
        "The darkness has swallowed my changes.",
      ],
    },
  },
  metal: {
    general: [
      "Shredding code at 200 BPM.",
      "This bug's a mosh pit of chaos.",
      "I'm headbanging through the stack trace.",
      "The server's screaming in pure distortion.",
      "My keyboard is my battle axe.",
      "This codebase is a wall of sound.",
      "I'm tuning my IDE to drop D.",
      "The compiler's got more gain than a Marshall stack.",
    ],
    byStatus: {
      working: [
        "Riffing through the codebase, no mercy.",
        "Shredding features at full volume.",
        "Cranking out commits like a solo.",
      ],
      waiting_approval: [
        "Waiting for the frontman's nod.",
        "The encore's on hold for approval.",
        "Holding the note until they say yes.",
      ],
      idle: [
        "Tuning my axe in the green room.",
        "Just vibing with the amp hum.",
        "Taking a breather between sets.",
      ],
      on_break: [
        "Grabbing a beer at the merch table.",
        "Stretching out after the first set.",
        "Charging up for the encore.",
      ],
      failed: [
        "The amp blew and so did the build.",
        "I dropped the mic and the tests failed.",
        "The whole setlist crashed to black.",
      ],
    },
  },
};

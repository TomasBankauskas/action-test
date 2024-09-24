import dotenv from "dotenv";
import fs from "fs";
import matter from "gray-matter";
import { marked } from "marked";
import markedPlaintify from "marked-plaintify";
import Parser from "rss-parser";


/* --- Types --- */

type FeedItem = {
  title: string;
  sourceUrl: string;
  excerpt: string;
  date: Date;
  imageUrl: string;
  slug: string;
  tags?: Array<"cli">;
};

/* --- Queries --- */

/**
 * Retrieves raw CLI releases from GitHub.
 */
async function getCliReleases(): Promise<Record<string, any>> {
  const response = await fetch("https://github.com/netlify/cli/releases.atom");
  const rawRss = await response.text();
  const parser = new Parser();
  const { items } = await parser.parseString(rawRss);
  return items;
}


/* --- Transformers --- */


/**
 * Transforms raw CLI releases into a format that can be used by the feed page.
 */
async function transformCliReleases(rawItems: Record<string, any>): Promise<FeedItem[]> {
  const feedItems: FeedItem[] = rawItems
    .map((item: any) => {
      const versionTag = item.link.split("/").pop();
      // simplified regex from https://semver.org/#is-there-a-suggested-regular-expression-regex-to-check-a-semver-string
      if (!versionTag.match(/(0|[1-9]\d*)\.(0|[1-9]\d*)\.0/)) {
        return null;
      }
      const slug = `cli-${versionTag.replace(/\./g, "-")}`;
      const date = new Date(item.pubDate);
      const title = item.title === versionTag ? `CLI Release: ${versionTag}` : item.title;

      return validateFeedItem({
        title,
        sourceUrl: item.link,
        excerpt: item.contentSnippet.replace(/\n/g, "\n\n"),
        date,
        imageUrl: "/images/feed-preview.svg",
        slug: `${date.toISOString().slice(0, 10)}-${slug}`,
        tags: ["cli"],
      });
    })
    .filter(Boolean);
  return feedItems;
}

/**
 * Get the latest CLI release and transforms into a format that can be used by the cli page.
 */
async function getLatestCliRelease(rawItems: Record<string, any>): Promise<{ version: string; sourceUrl: string }> {
  const latestRelease = rawItems[0];
  return {
    version: latestRelease.link.split("/").pop(),
    sourceUrl: latestRelease.link,
  };
}


/**
 * Remove markdown tokens from string, except lists.
 */
function removeMarkdown(str: string): string {
  return marked
    .use(
      markedPlaintify({
        list() {
          return false;
        },
        listitem() {
          return false;
        },
      })
    )
    .parse(str) as string;
}

/* --- Validator --- */

/**
 * Throws errors if any required properties are missing from a feed item. This
 * helps to fail the automated imports and protects against site builds failing
 * on Netlify.
 */
function validateFeedItem(item: FeedItem): FeedItem {
  if (!item.title) throw new Error(`Missing title for feed item: ${JSON.stringify(item)}`);
  if (!item.slug) throw new Error(`Missing slug for feed item: ${JSON.stringify(item)}`);
  if (!item.sourceUrl) throw new Error(`Missing sourceUrl for feed item: ${JSON.stringify(item)}`);
  if (!item.excerpt) throw new Error(`Missing excerpt for feed item: ${JSON.stringify(item)}`);
  if (!item.date) throw new Error(`Missing date for feed item: ${JSON.stringify(item)}`);
  if (!item.imageUrl) throw new Error(`Missing imageUrl for feed item: ${JSON.stringify(item)}`);

  return item;
}

/* --- Main Controller --- */

async function run() {
  // Fetch and transform feed items
  const rawCliReleases = await getCliReleases();
  const cliReleaseFeedItems = await transformCliReleases(rawCliReleases);
  const latestCliRelease = await getLatestCliRelease(rawCliReleases);

  // Write feed items to filesystem
  const feedItems = [...cliReleaseFeedItems];
  feedItems.map((item) => {
    const { slug, ...props } = item;
    fs.writeFileSync(`./src/content/feed/${slug}.md`, matter.stringify("", props));
  });
  console.log(`Wrote ${feedItems.length} feed items items to ./src/content/feed`);

  // Write latest CLI release to filesystem
  if (!fs.existsSync("./src/data/cli")) fs.mkdirSync("./src/data/cli", { recursive: true });
  fs.writeFileSync("./src/data/cli/latest.json", JSON.stringify(latestCliRelease, null, 2));

  // Cache raw result for debugging
  if (!fs.existsSync("./tmp")) fs.mkdirSync("tmp");
  console.log("Wrote raw changelog forum posts to ./tmp/changelog-forum-import.json");
  fs.writeFileSync("./tmp/cli-releases-import.json", JSON.stringify(rawCliReleases, null, 2));
  console.log("Wrote raw CLI releases to ./tmp/cli-releases-import.json");
}

run()
  .then(() => {
    console.log("Done");
  })
  .catch((err) => {
    console.log(err);
    process.exit(1);
  });

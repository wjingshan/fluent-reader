ALTER TABLE `items` ADD `linkKey` text;--> statement-breakpoint
CREATE INDEX `items_link_key` ON `items` (`linkKey`) WHERE "items"."linkKey" IS NOT NULL;
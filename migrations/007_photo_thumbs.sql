-- A small copy of an attached photo, made in the browser at upload and stored
-- by the hub with the photo. NULL when none was kept (a photo that is already
-- small, a format the browser could not draw, a file that is not a picture)
-- and for every attachment added before this column: the file in `file_id`
-- stands in for it.
ALTER TABLE app_group_channels__message_files ADD COLUMN thumb_file_id TEXT;

# Change Log

All notable changes to the "mdhvg-memscope" extension will be documented in this file.

## [1.0.2] - 2025-09-16

### Added

**EXTENSION ICON**

## [1.0.1] - 2025-09-16

### Added

- **Datatype selection**: User can now select the datatype of image (`uint8`, `int8`, `uint16`, `float32`, etc).

> `float` types have some color discrepancy which corrupts the value of a few pixels. My guess is that the normalization formula for `float` values is wrong. (Contributions are welcome)

## [1.0.0] - 2025-04-13

### Added

- **Live Preview**: View the image in real-time as you input pointer addresses, width, height, and channels.
- **Expression Parsing**: Supports evaluating expressions for width, height, and pointer, allowing dynamic updates.
- **Save Image**: Users can now save the rendered image as **PNG** or **JPG**.

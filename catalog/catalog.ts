import { Badge, Button, Card, Divider, Heading, Input, Skeleton, Stack, Text } from "./components";
import type { Catalog } from "./types";

/** The default Trusted Catalog. `satisfies Catalog` makes a missing component a compile error. */
export const DEFAULT_CATALOG = {
  Stack,
  Card,
  Heading,
  Text,
  Input,
  Button,
  Divider,
  Badge,
  Skeleton,
} satisfies Catalog;

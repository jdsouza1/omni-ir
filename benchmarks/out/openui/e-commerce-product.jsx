import { Button, Buttons, Card, CardHeader, Col, Form, FormControl, ImageGallery, MarkDownRenderer, RadioGroup, RadioItem, Select, SelectItem, Separator, Stack, Table, Tag, TagBlock, TextContent } from "@/components/ui";

export default function Screen() {
  return (
    <Stack direction="column" gap="l">
      <Card variant="clear">
        <TextContent size="large-heavy">Product Details</TextContent>
      </Card>
      <Stack direction="column" gap="l">
        <Stack direction="row" gap="l" align="start" justify="start" wrap={true}>
          <Card variant="card">
            <CardHeader subtitle="Lightweight daily trainers with responsive cushioning">AeroStride Runner Sneakers</CardHeader>
            <ImageGallery images={[{ src: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&q=80", alt: "Sneakers angled side view", details: "Side profile showing breathable mesh and cushioned midsole" }, { src: "https://images.unsplash.com/photo-1528701800489-20be3c1ea3b1?auto=format&fit=crop&w=1200&q=80", alt: "Sneakers top view", details: "Top view highlighting laces and padded tongue" }, { src: "https://images.unsplash.com/photo-1600269452121-4f2416e55c28?auto=format&fit=crop&w=1200&q=80", alt: "Sneakers outsole view", details: "Rubber outsole pattern for traction" }, { src: "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1200&q=80", alt: "Sneakers lifestyle shot", details: "Everyday styling in an urban setting" }]} />
          </Card>
          <Card variant="card">
            <CardHeader subtitle="Men's / Women's • Road & casual">AeroStride Runner</CardHeader>
            <Stack direction="row" gap="m" align="center" justify="between" wrap={true}>
              <TextContent size="large-heavy">$129.00</TextContent>
              <Tag icon="check" size="md" variant="success">In stock</Tag>
            </Stack>
            <Separator decorative={true}>horizontal</Separator>
            <Form name="select_size">
              <FormControl label="Size">
                <Select name="size" placeholder="Select your size..." rules={["required"]}>
                  <SelectItem label="US 7">7</SelectItem>
                  <SelectItem label="US 7.5">7.5</SelectItem>
                  <SelectItem label="US 8">8</SelectItem>
                  <SelectItem label="US 8.5">8.5</SelectItem>
                  <SelectItem label="US 9">9</SelectItem>
                  <SelectItem label="US 9.5">9.5</SelectItem>
                  <SelectItem label="US 10">10</SelectItem>
                  <SelectItem label="US 10.5">10.5</SelectItem>
                  <SelectItem label="US 11">11</SelectItem>
                  <SelectItem label="US 12">12</SelectItem>
                </Select>
              </FormControl>
            </Form>
            <Separator decorative={true}>horizontal</Separator>
            <Stack direction="column" gap="s">
              <TextContent size="small-heavy">Color</TextContent>
              <RadioGroup name="color" defaultValue="black_white" rules={["required"]}>
                <RadioItem description="Classic contrast with white midsole" value="black_white">Black / White</RadioItem>
                <RadioItem description="Neutral upper with gum outsole" value="sand_gum">Sand / Gum</RadioItem>
                <RadioItem description="Cool tones with neon accents" value="slate_neon">Slate / Neon</RadioItem>
              </RadioGroup>
            </Stack>
            <Separator decorative={true}>horizontal</Separator>
            <Buttons direction="row">
              <Button action="action:add_to_cart_sneakers" variant="primary">Add to Cart</Button>
              <Button action="action:save_sneakers" variant="secondary">Save</Button>
            </Buttons>
            <TextContent size="small">Free returns within 30 days. Ships in 1–2 business days.</TextContent>
          </Card>
        </Stack>
        <Stack direction="row" gap="l" align="start" justify="start" wrap={true}>
          <Card variant="sunk">
            <CardHeader subtitle="Built for comfort from morning commutes to weekend miles">About this item</CardHeader>
            <MarkDownRenderer textMarkdown={"The **AeroStride Runner** blends breathable mesh with a supportive heel counter for a secure fit. A responsive foam midsole delivers soft landings and quick transitions, while the durable rubber outsole adds traction on city streets.\n\n**Fit note:** True to size. If you’re between sizes, consider going up 0.5."} variant="clear" />
            <TagBlock tags={["Breathable mesh upper", "Responsive foam cushioning", "Rubber traction outsole", "Padded collar & tongue", "Everyday training"]} />
          </Card>
          <Card variant="sunk">
            <CardHeader subtitle="Materials, weight, and care">Specs</CardHeader>
            <Table rows={[["Weight", "9.8 oz (US 9)"], ["Drop", "8 mm"], ["Upper", "Engineered mesh"], ["Midsole", "EVA-based foam"], ["Outsole", "High-abrasion rubber"], ["Care", "Spot clean; air dry"]]}>
              <Col type="string">Detail</Col>
              <Col type="string">Value</Col>
            </Table>
          </Card>
        </Stack>
      </Stack>
    </Stack>
  );
}

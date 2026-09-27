import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ModelPicker } from "./ModelPicker";

describe("ModelPicker", () => {
  it("desabilita o select quando não há modelos nem modelo atual", () => {
    render(<ModelPicker model="" models={[]} error="" disabled={false} onChange={vi.fn()} />);
    expect(screen.getByRole("combobox", { name: "Modelo" })).toBeDisabled();
  });

  it("põe o modelo atual primeiro quando o provider não o lista", () => {
    render(<ModelPicker model="llama3.2" models={["a", "b"]} error="" disabled={false} onChange={vi.fn()} />);
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["llama3.2", "a", "b"]);
  });

  it("não duplica o modelo atual quando ele já está na lista", () => {
    render(<ModelPicker model="a" models={["a", "b"]} error="" disabled={false} onChange={vi.fn()} />);
    expect(screen.getAllByRole("option")).toHaveLength(2);
  });

  it("chama onChange só quando o modelo muda", async () => {
    const onChange = vi.fn();
    render(<ModelPicker model="a" models={["a", "b"]} error="" disabled={false} onChange={onChange} />);
    const select = screen.getByRole("combobox", { name: "Modelo" });
    await userEvent.selectOptions(select, "a");
    expect(onChange).not.toHaveBeenCalled();
    await userEvent.selectOptions(select, "b");
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("mostra o erro como status", () => {
    render(<ModelPicker model="a" models={[]} error="Ollama parado" disabled={false} onChange={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent("Ollama parado");
  });

  it("respeita disabled", () => {
    render(<ModelPicker model="a" models={["a"]} error="" disabled onChange={vi.fn()} />);
    expect(screen.getByRole("combobox", { name: "Modelo" })).toBeDisabled();
  });
});

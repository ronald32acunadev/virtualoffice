import { highlightSegments } from "../state/slashMenu";

export function Highlight({ text, start, length }: { text: string; start: number; length: number }) {
  return (
    <>
      {highlightSegments(text, start, length).map((segment, index) =>
        segment.match ? (
          <mark key={index} className="hl">
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  );
}

/**
 * FieldConditions.tsx — the editor for per-form-type field conditions.
 *
 * One row per condition: which question, which operator, and the value editor
 * that operator needs. The row is driven entirely by the field's `kind`, so a
 * date question offers a date picker and a dropdown offers its own options
 * without this component knowing anything about a specific form.
 */
import { useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  Divider,
  FormControl,
  IconButton,
  ListItemText,
  ListSubheader,
  Menu,
  MenuItem,
  OutlinedInput,
  Select,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { Add as AddIcon, Close as CloseIcon } from "@mui/icons-material";
import { editorial } from "../../theme/editorial";
import {
  OPS_BY_KIND,
  defaultOpForKind,
  groupFieldsBySection,
  opArity,
  opLabel,
  type FieldFilterOp,
  type FilterableField,
} from "../../utils/formFieldCatalog";
import { createFieldFilter, type FieldFilter } from "../../utils/submissionFilters";

const controlSx = {
  borderRadius: "10px",
  backgroundColor: editorial.white,
} as const;

/** The HTML input type a single-value editor uses for this field kind. */
function inputTypeFor(kind: FilterableField["kind"]): string {
  switch (kind) {
    case "date":
    case "datetime":
      return "date";
    case "time":
      return "time";
    case "number":
      return "number";
    default:
      return "text";
  }
}

interface FieldConditionRowProps {
  filter: FieldFilter;
  field?: FilterableField;
  onChange: (next: FieldFilter) => void;
  onRemove: () => void;
}

export function FieldConditionRow({ filter, field, onChange, onRemove }: FieldConditionRowProps) {
  const ops = OPS_BY_KIND[filter.kind] ?? OPS_BY_KIND.text;
  const arity = opArity(filter.op);
  const choices = field?.choices ?? [];
  const inputType = inputTypeFor(filter.kind);

  const valueEditor = () => {
    if (arity === "none") return null;

    if (arity === "many") {
      // A SharePoint-backed choice can reach us with no options at all; a plain
      // text box still lets the admin name the value they are looking for.
      if (!choices.length) {
        return (
          <TextField
            size="small"
            placeholder="Value"
            value={filter.values[0] ?? ""}
            onChange={(e) => onChange({ ...filter, values: e.target.value ? [e.target.value] : [] })}
            sx={{ minWidth: 0, "& .MuiOutlinedInput-root": controlSx }}
          />
        );
      }
      return (
        <FormControl size="small" sx={{ minWidth: 0 }}>
          <Select
            multiple
            displayEmpty
            value={filter.values}
            onChange={(e) =>
              onChange({
                ...filter,
                values: typeof e.target.value === "string" ? e.target.value.split(",") : e.target.value,
              })
            }
            input={<OutlinedInput sx={controlSx} />}
            renderValue={(selected) =>
              selected.length
                ? selected
                    .map((value) => choices.find((choice) => choice.value === value)?.label ?? value)
                    .join(", ")
                : "Any option"
            }
          >
            {choices.map((choice) => (
              <MenuItem key={choice.value} value={choice.value}>
                <Checkbox size="small" checked={filter.values.includes(choice.value)} />
                <ListItemText primary={choice.label} />
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      );
    }

    if (arity === "two") {
      return (
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, minWidth: 0 }}>
          <TextField
            size="small"
            type={inputType}
            placeholder="From"
            value={filter.value}
            onChange={(e) => onChange({ ...filter, value: e.target.value })}
            sx={{ "& .MuiOutlinedInput-root": controlSx }}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            size="small"
            type={inputType}
            placeholder="To"
            value={filter.value2}
            onChange={(e) => onChange({ ...filter, value2: e.target.value })}
            sx={{ "& .MuiOutlinedInput-root": controlSx }}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Box>
      );
    }

    return (
      <TextField
        size="small"
        type={inputType}
        placeholder="Value"
        value={filter.value}
        onChange={(e) => onChange({ ...filter, value: e.target.value })}
        sx={{ minWidth: 0, "& .MuiOutlinedInput-root": controlSx }}
      />
    );
  };

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1.1fr) minmax(0, 0.9fr) minmax(0, 1.4fr) auto" },
        gap: 1,
        alignItems: "center",
        p: 1,
        borderRadius: "10px",
        backgroundColor: editorial.blueSoft,
        border: `1px solid ${editorial.border}`,
      }}
    >
      <Typography
        sx={{
          fontWeight: 700,
          fontSize: "0.85rem",
          color: editorial.ink,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          px: 0.5,
        }}
        title={field?.label ?? filter.key}
      >
        {field?.label ?? filter.key}
      </Typography>

      <FormControl size="small" sx={{ minWidth: 0 }}>
        <Select
          value={filter.op}
          onChange={(e) => {
            const op = e.target.value as FieldFilterOp;
            // Values carry no meaning across arities — a range's bounds are not a
            // multi-select's options — so switching operator starts them clean.
            onChange({ ...filter, op, value: "", value2: "", values: [] });
          }}
          input={<OutlinedInput sx={controlSx} />}
        >
          {ops.map((op) => (
            <MenuItem key={op} value={op}>
              {opLabel(op)}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <Box sx={{ minWidth: 0 }}>{valueEditor()}</Box>

      <Tooltip title="Remove condition">
        <IconButton size="small" onClick={onRemove} sx={{ justifySelf: { xs: "end", md: "center" } }}>
          <CloseIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Tooltip>
    </Box>
  );
}

interface AddFieldConditionProps {
  fields: FilterableField[];
  onAdd: (filter: FieldFilter) => void;
  disabled?: boolean;
}

export function AddFieldCondition({ fields, onAdd, disabled }: AddFieldConditionProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const groups = groupFieldsBySection(fields);

  return (
    <>
      <Button
        size="small"
        startIcon={<AddIcon />}
        disabled={disabled || !fields.length}
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{
          alignSelf: "start",
          textTransform: "none",
          fontWeight: 800,
          borderRadius: "10px",
          color: editorial.pmwBlueDark,
          border: `1px dashed ${editorial.pmwBlueSoft}`,
          px: 1.5,
          "&:hover": { backgroundColor: editorial.blueWash, borderColor: editorial.pmwBlue },
        }}
      >
        Add field condition
      </Button>

      <Menu
        anchorEl={anchor}
        open={!!anchor}
        onClose={() => setAnchor(null)}
        slotProps={{ paper: { sx: { maxHeight: 420, minWidth: 260 } } }}
      >
        {groups.map((group, index) => [
          index > 0 ? <Divider key={`${group.section}-divider`} /> : null,
          <ListSubheader
            key={`${group.section}-header`}
            sx={{ fontWeight: 800, fontSize: "0.72rem", letterSpacing: "0.06em", textTransform: "uppercase" }}
          >
            {group.section}
          </ListSubheader>,
          ...group.fields.map((field) => (
            <MenuItem
              key={field.key}
              onClick={() => {
                onAdd(createFieldFilter(field));
                setAnchor(null);
              }}
            >
              <ListItemText
                primary={field.label}
                secondary={opLabel(defaultOpForKind(field.kind))}
                slotProps={{
                  primary: { sx: { fontSize: "0.88rem" } },
                  secondary: { sx: { fontSize: "0.72rem" } },
                }}
              />
            </MenuItem>
          )),
        ])}
      </Menu>
    </>
  );
}

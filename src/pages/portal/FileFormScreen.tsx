import { useNavigate } from "react-router-dom";
import { Box, Stack, Typography } from "@mui/material";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import { editorial, editorialHairline } from "../../theme/editorial";
import { panelSx, radius } from "../../theme/surfaces";
import { IconTile, PageHeader, Widget, WidgetEmpty } from "../../components/Widget";
import { usePortal } from "../../contexts/PortalContext";
import ReferenceTag from "../../components/ReferenceTag";
import type { CatalogueEntry } from "../../types";

/**
 * File a form — pick a form type, then fill in that form.
 *
 * This screen used to render a built-in five-question report (where, how bad,
 * what happened, name, email) whatever you picked, and post it by guessing
 * which of the real form's columns those five answers belonged in. So a form
 * authored in the builder with twenty questions — half of them required —
 * produced a record with three fields set, no validation, and no sign that
 * anything had been skipped. The form you picked and the form you got were
 * two different things.
 *
 * There is now exactly one place a form is defined: the pmw-hrform builder.
 * This screen is a picker, and picking opens the published form itself at
 * /form/{slug}, with its own schema, validation and PDPA consent.
 */
export default function FileFormScreen() {
  const { catalogue } = usePortal();
  const navigate = useNavigate();

  const openable = (entry: CatalogueEntry) => Boolean(entry.slug);

  return (
    <Box sx={{ maxWidth: 800 }}>
      <PageHeader
        title="File a form"
        subtitle="each one opens the published form itself · your name and email come from your account"
        meta={catalogue.length > 0 ? `${catalogue.length} published` : undefined}
      />

      {catalogue.length === 0 ? (
        <Widget bare>
          <WidgetEmpty>
            No form types are published yet. Forms are authored in the PMW form builder; once one is published there it
            appears here.
          </WidgetEmpty>
        </Widget>
      ) : (
        <Box sx={{ ...panelSx, overflow: "hidden" }}>
          {catalogue.map((entry, index) => {
            const canOpen = openable(entry);
            return (
              <Box
                key={entry.listTitle}
                component={canOpen ? "button" : "div"}
                type={canOpen ? "button" : undefined}
                onClick={canOpen ? () => navigate(`/form/${encodeURIComponent(entry.slug)}`) : undefined}
                aria-disabled={canOpen ? undefined : true}
                sx={{
                  width: "100%",
                  minHeight: 64,
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                  px: 2,
                  py: 1.5,
                  textAlign: "left",
                  cursor: canOpen ? "pointer" : "default",
                  border: "none",
                  borderTop: index === 0 ? "none" : editorialHairline,
                  background: "transparent",
                  color: "inherit",
                  font: "inherit",
                  opacity: canOpen ? 1 : 0.6,
                  transition: "background-color 0.16s ease",
                  "&:hover": canOpen ? { background: editorial.blueWash } : undefined,
                  "&:hover .file-form-arrow": canOpen ? { color: editorial.pmwBlueDark, transform: "translateX(3px)" } : undefined,
                  "@media (prefers-reduced-motion: reduce)": {
                    "&:hover .file-form-arrow": { transform: "none" },
                  },
                }}
              >
                <IconTile tone={canOpen ? "ink" : "muted"}>
                  <DescriptionOutlinedIcon />
                </IconTile>

                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.5 }}>
                    <Typography sx={{ fontSize: 15.5, fontWeight: 700 }}>{entry.name}</Typography>
                    <ReferenceTag value={entry.code} />
                    {entry.isPublic && (
                      <Box
                        component="span"
                        sx={{
                          fontSize: 10,
                          fontWeight: 800,
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                          px: 0.8,
                          py: 0.25,
                          borderRadius: radius.full,
                          border: editorialHairline,
                          color: editorial.muted,
                        }}
                      >
                        Public link
                      </Box>
                    )}
                  </Stack>
                  {/* What happens after you submit — which for plenty of these
                      forms is nothing, and saying so is the point. */}
                  <Typography sx={{ fontSize: 12, color: editorial.muted, mt: 0.2 }}>
                    {canOpen
                      ? entry.hasWorkflow
                        ? `${entry.workflow.label} · first to ${entry.firstApprover}`
                        : entry.workflow.label
                      : "This form has no published link yet — republish it in the form builder to open it here."}
                  </Typography>
                </Box>

                {canOpen && (
                  <ArrowForwardIcon
                    className="file-form-arrow"
                    sx={{
                      fontSize: 18,
                      flex: "none",
                      color: editorial.muted,
                      transition: "color 0.16s ease, transform 0.16s ease",
                    }}
                  />
                )}
              </Box>
            );
          })}
        </Box>
      )}

      <Typography sx={{ fontSize: 12, color: editorial.muted, mt: 3, maxWidth: "62ch" }}>
        Every form here is the one published from the PMW form builder — the same schema, validation and consent text an
        anonymous visitor gets on its public link. Nothing on this screen defines a form of its own.
      </Typography>
    </Box>
  );
}

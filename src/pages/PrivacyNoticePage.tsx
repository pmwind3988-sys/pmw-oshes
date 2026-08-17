import { Link as RouterLink, useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  Container,
  Divider,
  Link,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ShieldIcon from "@mui/icons-material/Shield";
import { editorial } from "../theme/editorial";
import {
  PDPA_CONTACT_EMAIL,
  PDPA_CONTROLLER_NAME,
  PDPA_NOTICE_SECTIONS,
  PDPA_NOTICE_VERSION,
} from "../utils/pdpa";

export default function PrivacyNoticePage() {
  const navigate = useNavigate();

  return (
    <Box sx={{ minHeight: "100dvh", background: "linear-gradient(180deg, #BFDDF4 0%, #DCECF8 42%, #F7F5EF 100%)", py: { xs: 3, md: 5 } }}>
      <Container maxWidth="md">
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate(-1)}
          sx={{ mb: 2, textTransform: "none", color: editorial.ink, fontWeight: 800 }}
        >
          Back
        </Button>

        <Paper sx={{ borderRadius: "18px", overflow: "hidden", border: `1px solid ${editorial.ink}`, boxShadow: "none" }}>
          {/* The signal yellow is one of the few fills that keeps its hue in
              every theme, so the text on it is pinned to the on-yellow ink
              rather than following the theme's — which inverts to near-white
              on Midnight and vanishes. */}
          <Box sx={{ p: { xs: 3, md: 5 }, backgroundColor: editorial.yellow, color: editorial.black, borderBottom: `1px solid ${editorial.ink}` }}>
            <Box sx={{ mb: 1, display: "flex", alignItems: "center", gap: 1.5 }}>
              <ShieldIcon />
              <Typography variant="overline" sx={{ letterSpacing: 0, fontWeight: 700 }}>
                PDPA Privacy Notice
              </Typography>
            </Box>
            <Typography variant="h1" sx={{ fontSize: { xs: "2.5rem", md: "4rem" } }}>
              Personal Data Protection Notice
            </Typography>
            <Typography variant="body2" sx={{ mt: 1, opacity: 0.9 }}>
              {PDPA_CONTROLLER_NAME} | Notice version {PDPA_NOTICE_VERSION}
            </Typography>
          </Box>

          <Box sx={{ p: { xs: 3, md: 4 } }}>
            <Typography variant="body1" sx={{ color: editorial.ink, lineHeight: 1.8 }}>
              This notice explains how personal data submitted through PMW OSHES Forms is collected,
              used, disclosed, protected, retained, and made available for access or correction requests.
            </Typography>

            <Divider sx={{ my: 3 }} />

            <Stack spacing={3}>
              {PDPA_NOTICE_SECTIONS.map((section) => (
                <Box key={section.title}>
                  <Typography variant="h6" sx={{ fontWeight: 800, color: editorial.ink, mb: 0.75 }}>
                    {section.title}
                  </Typography>
                  <Typography variant="body2" sx={{ color: editorial.muted, lineHeight: 1.8 }}>
                    {section.body}
                  </Typography>
                </Box>
              ))}
            </Stack>

            <Divider sx={{ my: 3 }} />

            <Typography variant="body2" sx={{ color: editorial.muted, lineHeight: 1.8 }}>
              Questions, access requests, or correction requests can be sent to{" "}
              <Link href={`mailto:${PDPA_CONTACT_EMAIL}`} sx={{ fontWeight: 700 }}>
                {PDPA_CONTACT_EMAIL}
              </Link>
              . This notice should be read together with any form-specific instructions shown before submission.
            </Typography>

            <Button
              component={RouterLink}
              to="/"
              variant="outlined"
              sx={{ mt: 3, borderRadius: 0, textTransform: "none", fontWeight: 800 }}
            >
              Return Home
            </Button>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
}
